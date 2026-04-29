package com.eduardo.budgeting;


import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@TestPropertySource(properties = {
        "spring.ai.openai.api-key=${OPENROUTER_API_KEY}",
        "spring.ai.openai.base-url=https://openrouter.ai/api/v1"
})
public class OpenAiChatClientIT {
    @Autowired
    ChatModel chatModel;

    @Test
    void should_executeSum_when_prompted() {
        var chatClient = ChatClient.builder(chatModel).defaultSystem("Você é um matemático").build();

        var response = chatClient.prompt("Some 10 mais 20, depois subtraia 30 do resultado anterior. " +
                "Exiba apenas o resultado final sem explicações.").call().content();

        Assertions.assertThat(response).contains("0");
        IO.println(response);
    }
}
