package com.eduardo.budgeting;


import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
@EnabledIfEnvironmentVariable(named = "OPENAI_API_KEY", matches = ".*")
public class OpenAiChatModelIT {

    @Autowired
    OpenAiChatModel chatModel;


    @Test
    void should_ReceiveResponse_when_chatModelIsCalled() {

        String response = chatModel.call("Gere um registro de budgeting, com descrição de gasto, valor em reais e local.");

        Assertions.assertThat(response).isNotEmpty();
        IO.println(response);
    }

}
