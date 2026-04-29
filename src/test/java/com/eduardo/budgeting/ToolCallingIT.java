package com.eduardo.budgeting;


import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@EnabledIfEnvironmentVariable(named = "OPENAI_API_KEY", matches = ".*")
public class ToolCallingIT {
    @Autowired
    OpenAiChatModel chatModel;

    static class MathTools {
        @Tool(description = "soma dois números inteiros, a e b")
        public int sum(int a, int b) {
            return a + b;
        }

        @Tool(description = "subtrai dois números inteiros, a e b")
        public int diff(int a, int b) {
            return a - b;
        }
    }

    @Test
    void should_executeSum_when_prompted() {
        var chatClient = ChatClient.builder(chatModel).defaultSystem("Você é um matemático")
                .defaultTools(new MathTools()).build();

        var response = chatClient.prompt("Some 10 mais 20, depois subtraia 30 do resultado anterior. " +
                        "Exiba apenas o resultado final sem explicações.")
                .call().content();

        Assertions.assertThat(response).contains("0");
        IO.println(response);
    }
}
