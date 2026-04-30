package com.eduardo.budgeting;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.ai.openai.OpenAiAudioSpeechModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.IOException;
import java.nio.file.Files;

@SpringBootTest
@EnabledIfEnvironmentVariable(named = "OPENAI_API_KEY", matches = ".*")
public class OpenAiSpeechModelIT {

    @Autowired
    OpenAiAudioSpeechModel openAiAudioSpeechModel;

    @Test
    public void should_produceAudio_when_textIsProvided() {
        var response = openAiAudioSpeechModel.call("O valor total do serviço ficou em 80 reais. " +
                "Posso confirmar o pagamento?");

        Assertions.assertThat(response).hasSizeGreaterThan(1024);

        try {
            var tempFile = Files.createTempFile("AUDIO_", ".mp3");
            Files.write(tempFile, response);
            IO.println(tempFile.toAbsolutePath());
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
