package com.eduardo.budgeting;

import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest
@EnabledIfEnvironmentVariable(named = "RUN_PAID_BENCHMARK", matches = "yes")
class VoiceBenchmarkIT {
    @Autowired Voice voice;

    record Case(String clip, Long amount, String category, LocalDate date, String... descriptionTerms) {}
    record Sample(byte[] audio, Case rubric) {}

    static class Score {
        int correct;
        int scorable;
        int failures;
        int skipped;
        int unknownCost;
        long knownMicroUsd;
    }

    @Test void pairedTrials() throws Exception {
        if (System.getenv().getOrDefault("OPENAI_API_KEY", "").isBlank()
                || System.getenv().getOrDefault("DATABASE_URL", "").isBlank()) {
            throw new IllegalStateException("Defina a chave de IA e o banco que controla o orçamento do piloto.");
        }

        LocalDate today = LocalDate.of(2026, 11, 23);
        List<Case> cases = List.of(
                new Case("recording-1", 8000L, "Mercado", today, "mercado", "supermercado"),
                new Case("recording-2", null, "Farmácia", today, "farmac", "remedio", "medicamento"),
                new Case("recording-3", 12000L, "Automóvel", today, "combustivel", "gasolina", "posto"),
                new Case("recording-4", 9000L, "Restaurantes", today, "almoco", "restaurante", "refeicao"),
                new Case("recording-5", 20000L, "Saúde", today, "clinica", "consulta"),
                new Case("recording-6", 6500L, "Automóvel", today, "oleo"),
                new Case("ontem", 4290L, "Restaurantes", today.minusDays(1), "restaurante"),
                new Case("nova", 1900L, "Jardinagem", today, "jardin"),
                new Case("ambiguo", null, "Mercado", today, "mercado"));
        var categories = List.of("Mercado", "Farmácia", "Automóvel", "Restaurantes", "Saúde");

        // Read and validate the entire corpus before making a paid request.
        var samples = new ArrayList<Sample>();
        for (var rubric : cases) {
            var audio = Files.readAllBytes(Path.of("target/voice-cases", rubric.clip() + ".wav"));
            Voice.millis(audio);
            samples.add(new Sample(audio, rubric));
        }

        var paths = List.of(Voice.Path.transcription, Voice.Path.direct);
        var scores = new EnumMap<Voice.Path, Score>(Voice.Path.class);
        paths.forEach(path -> scores.put(path, new Score()));
        for (int i = 0; i < samples.size(); i++) {
            for (var path : i % 2 == 0 ? paths : paths.reversed()) {
                trial(samples.get(i), today, categories, path, scores.get(path));
            }
        }
        scores.forEach(VoiceBenchmarkIT::summary);
    }

    private void trial(Sample sample, LocalDate today, List<String> categories, Voice.Path path, Score score) {
        var rubric = sample.rubric();
        boolean scorable = !rubric.clip().equals("recording-2");
        long start = System.nanoTime();
        try {
            var result = voice.interpret(sample.audio(), today, categories, path);
            var draft = result.draft();
            boolean amount = Objects.equals(rubric.amount(), draft.amount());
            boolean date = rubric.date().equals(draft.date());
            boolean category = rubric.category().equalsIgnoreCase(draft.category());
            String description = Normalizer.normalize(Objects.toString(draft.description(), ""), Normalizer.Form.NFD)
                    .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
            boolean descriptionMatches = Arrays.stream(rubric.descriptionTerms()).anyMatch(description::contains);
            if (scorable) {
                score.scorable++;
                if (amount && date && category && descriptionMatches) score.correct++;
            }
            if (result.microUsd() == null) score.unknownCost++;
            else score.knownMicroUsd += result.microUsd();
            System.out.printf("case=%s path=%s amount=%s date=%s category=%s description=%s ms=%d microUSD=%s%n",
                    rubric.clip(), path, scorable ? String.valueOf(amount) : "unscored", date,
                    category, descriptionMatches, elapsedMillis(start), result.microUsd());
        } catch (ResponseStatusException failure) {
            if (failure.getStatusCode().equals(HttpStatus.TOO_MANY_REQUESTS)) {
                score.skipped++;
            } else {
                score.failures++;
                if (scorable) score.scorable++;
                if (failure instanceof Voice.AttemptFailed attempt && attempt.microUsd() != null) {
                    score.knownMicroUsd += attempt.microUsd();
                } else {
                    score.unknownCost++;
                }
            }
            System.out.printf("case=%s path=%s status=%d ms=%d%n",
                    rubric.clip(), path, failure.getStatusCode().value(), elapsedMillis(start));
        }
    }

    private static long elapsedMillis(long start) {
        return (System.nanoTime() - start) / 1_000_000;
    }

    private static void summary(Voice.Path path, Score score) {
        String costPerCorrect = score.correct == 0 || score.unknownCost != 0 ? "unavailable"
                : String.valueOf(Math.ceilDiv(score.knownMicroUsd, score.correct));
        System.out.printf("path=%s correct=%d scorable=%d failed=%d skippedBudget=%d unknownCost=%d knownMicroUSD=%d microUSDPerCorrect=%s%n",
                path, score.correct, score.scorable, score.failures, score.skipped, score.unknownCost,
                score.knownMicroUsd, costPerCorrect);
    }
}
