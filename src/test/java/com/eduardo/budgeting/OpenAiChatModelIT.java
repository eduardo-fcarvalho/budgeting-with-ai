package com.eduardo.budgeting;


import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@TestPropertySource(properties = {
        "spring.ai.openai.api-key=${OPENROUTER_API_KEY}",
        "spring.ai.openai.base-url=https://openrouter.ai/api/v1"
})
public class OpenAiChatModelIT {

    @Autowired
    ChatModel chatModel;


    @Test
    void should_ReceiveResponse_when_chatModelIsCalled() {

        String response = chatModel.call("Gere um registro de budgeting, com descrição de gasto, valor em reais e local");

        Assertions.assertThat(response).isNotEmpty();
        IO.println(response);
    }

}
