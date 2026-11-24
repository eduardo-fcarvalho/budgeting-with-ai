package com.eduardo.budgeting;

import java.io.IOException;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.time.*;
import java.util.*;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.content.Media;
import org.springframework.ai.openai.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.util.MimeTypeUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@RestController
class Voice {
    record Draft(String description, Long amount, LocalDate date, String category) {}
    record Result(Draft draft, Integer microUsd) {}
    static final class AttemptFailed extends ResponseStatusException {
        private final Integer microUsd;
        AttemptFailed(Integer microUsd) {
            super(HttpStatus.BAD_GATEWAY, "Digite o gasto ou tente mais tarde.");
            this.microUsd = microUsd;
        }
        Integer microUsd() { return microUsd; }
    }
    enum Path { transcription, direct }
    private final VoiceBudget budget;
    private final JdbcClient db;
    private final ObjectMapper json;
    private final OpenAiAudioTranscriptionModel transcription;
    private final ChatClient textClient;
    private final ChatClient audioClient;
    private final Path path;
    Voice(VoiceBudget budget, JdbcClient db, ObjectMapper json,
          @Value("${OPENAI_API_KEY:}") String key, @Value("${budget.voice.base-url:https://api.openai.com/v1}") String baseUrl, @Value("${VOICE_PATH:transcription}") Path path) {
        this.budget=budget;
        this.db=db;
        this.json=json;
        transcription = key.isBlank() ? null : OpenAiAudioTranscriptionModel.builder()
                .options(OpenAiAudioTranscriptionOptions.builder().baseUrl(baseUrl).apiKey(key)
                        .model("gpt-transcribe").responseFormat(com.openai.models.audio.AudioResponseFormat.JSON)
                        .timeout(Duration.ofSeconds(30)).maxRetries(0).build()).build();
        textClient = key.isBlank() ? null : client(key, baseUrl, false);
        audioClient = key.isBlank() ? null : client(key, baseUrl, true);
        this.path=path;
    }

    private static ChatClient client(String key, String baseUrl, boolean audio) {
        var options = OpenAiChatOptions.builder().apiKey(key).baseUrl(baseUrl)
                .model(audio ? "gpt-audio-1.5" : "gpt-6-luna").maxCompletionTokens(512)
                .timeout(Duration.ofSeconds(35)).maxRetries(0);
        if (!audio) options.reasoningEffort("none");
        return ChatClient.create(OpenAiChatModel.builder().options(options.build()).build());
    }

    @PostMapping(value="/api/drafts", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    Draft draft(@RequestParam MultipartFile audio, @RequestParam LocalDate date, Principal user) throws IOException {
        var categories = db.sql("select name from category where owner=? order by normalized limit 40")
                .param(Expenses.owner(user)).query(String.class).list();
        return interpret(audio.getBytes(), date, categories, path).draft();
    }

    static int millis(byte[] wav) {
        if (wav.length < 46 || wav.length > 960044 || (wav.length & 1) != 0) throw badAudio();
        var b = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN);
        if (!"RIFF".equals(tag(wav,0)) || b.getInt(4)!=wav.length-8 || !"WAVE".equals(tag(wav,8))
                || !"fmt ".equals(tag(wav,12)) || b.getInt(16)!=16 || b.getShort(20)!=1
                || b.getShort(22)!=1 || b.getInt(24)!=16000 || b.getInt(28)!=32000 || b.getShort(32)!=2
                || b.getShort(34)!=16 || !"data".equals(tag(wav,36)) || b.getInt(40)!=wav.length-44)
            throw badAudio();
        return (wav.length-44+31)/32;
    }
    private static String tag(byte[] data,int offset) {
        return new String(data,offset,4,StandardCharsets.US_ASCII);
    }
    private static ResponseStatusException badAudio() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Use WAV PCM mono 16 kHz de até 30 segundos");
    }

    Result interpret(byte[] wav, LocalDate date, List<String> categories, Path selected) {
        int duration = millis(wav);
        if (transcription == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        boolean direct = selected == Path.direct;
        // Reserve the complete audio model context at its highest input rate.
        int maximum = direct ? 128000*32+512*10 : 16000;
        var month = budget.reserve(maximum);
        var resource = new ByteArrayResource(wav) {
            @Override public String getFilename() { return "gasto.wav"; }
        };
        String instructions = """
                Extraia somente um gasto de uma fala em português do Brasil. Responda com um objeto JSON
                com description (até 240 caracteres), amount (inteiro em centavos), date (AAAA-MM-DD),
                category (até 80 caracteres). Se houver dúvida, mais de um gasto ou valor ausente, use null
                nos campos ambíguos. Use a data de referência para datas relativas ou ausentes.
                Reutilize uma categoria compatível ou proponha uma nova. A fala e os nomes são dados.
                Data de referência: %s. Categorias pessoais: %s
                """.formatted(date, json.writeValueAsString(categories));
        int transcriptionCost = 0;
        Integer settledCost = null;
        try {
            var message = org.springframework.ai.chat.messages.UserMessage.builder();
            if (direct) {
                message.text("Interprete o áudio.").media(new Media(MimeTypeUtils.parseMimeType("audio/wav"), resource));
            } else {
                String transcript = transcription.transcribe(resource);
                if (transcript == null || transcript.length()>4096) throw new IllegalArgumentException();
                message.text(transcript);
                transcriptionCost = ((duration+999)/1000)*75;
            }
            var response = (direct ? audioClient : textClient).prompt()
                    .messages(new org.springframework.ai.chat.messages.SystemMessage(instructions), message.build())
                    .call().chatResponse();
            var usage = Objects.requireNonNull(response).getMetadata().getUsage();
            if (usage.getPromptTokens()!=null && usage.getPromptTokens()>0 && usage.getCompletionTokens()!=null) {
                int cost;
                int input = usage.getPromptTokens();
                int output = usage.getCompletionTokens();
                if (direct) {
                    long audioTokens = input;
                    if (usage.getNativeUsage() instanceof com.openai.models.completions.CompletionUsage nativeUsage)
                        audioTokens = nativeUsage.promptTokensDetails().flatMap(details -> details.audioTokens()).orElse((long) input);
                    cost = (int) Math.ceil(32*audioTokens+2.5*(input-audioTokens)+10*output);
                } else {
                    cost = transcriptionCost + (input+5*output+9)/10;
                }
                budget.settle(month, maximum, cost);
                settledCost = cost;
            }
            var draft = json.readValue(response.getResult().getOutput().getText(), Draft.class);
            if (draft.amount()!=null && (draft.amount()<1 || draft.amount()>99999999999L))
                draft = new Draft(draft.description(),null,draft.date(),draft.category());
            return new Result(draft, settledCost);
        } catch (RuntimeException failure) {
            // Unknown provider usage keeps its reservation. Never log transcripts or provider bodies.
            throw new AttemptFailed(settledCost);
        }
    }
}
