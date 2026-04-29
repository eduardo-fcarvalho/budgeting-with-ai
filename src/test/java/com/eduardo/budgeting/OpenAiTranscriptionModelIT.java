package com.eduardo.budgeting;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.ai.audio.transcription.AudioTranscriptionPrompt;
import org.springframework.ai.openai.OpenAiAudioTranscriptionModel;
import org.springframework.ai.openai.OpenAiAudioTranscriptionOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;

@SpringBootTest
@EnabledIfEnvironmentVariable(named = "OPENAI_API_KEY", matches = ".*")
public class OpenAiTranscriptionModelIT {

    @Autowired
    OpenAiAudioTranscriptionModel openAiAudioTranscriptionModel;

    @ParameterizedTest
    @CsvSource({
            "recording-1.mp3, 80 reais, oitenta reais",
            "recording-2.mp3, 40 reais, quarenta reais",
            "recording-3.mp3, 120 reais, cento e vinte reais",
            "recording-4.mp3, 90 reais, noventa reais",
            "recording-5.mp3, 200 reais, duzentos reais",
    })
    public void should_containExpectedKeywords_when_audioFileIsProcessed(String fileName, String numericKeyword, String writtenKeyword) {
        var audioResource = new ClassPathResource("audio/" + fileName);

        AudioTranscriptionPrompt recording = new AudioTranscriptionPrompt(audioResource);

        var response = openAiAudioTranscriptionModel.call(recording).getResults().getFirst().getOutput();

        Assertions.assertThat(response).satisfiesAnyOf(
                r -> Assertions.assertThat(r).containsIgnoringCase(numericKeyword),
                r -> Assertions.assertThat(r).containsIgnoringCase(writtenKeyword)
        );

        IO.println(response);
    }
}
