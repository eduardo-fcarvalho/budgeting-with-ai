package com.eduardo.budgeting;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties="OPENAI_API_KEY=local-contract-test")
@Transactional
class VoiceContractTest {
    static HttpServer server;
    static List<String> requests = new CopyOnWriteArrayList<>();
    @Autowired Voice voice;
    @Autowired VoiceBudget budget;

    @DynamicPropertySource static void provider(DynamicPropertyRegistry registry) throws IOException {
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/v1/", exchange -> {
            String body=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.ISO_8859_1);
            requests.add(body);
            String response=exchange.getRequestURI().getPath().endsWith("transcriptions") ?
                    "{\"text\":\"Ontem paguei 42,90 no restaurante\"}" : """
                    {"id":"chat-test","model":"fixture","created":1,"object":"chat.completion",
                    "choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"{\\"amount\\":4290,\\"category\\":\\"Restaurantes\\",\\"date\\":\\"2026-11-22\\",\\"description\\":\\"Almoço\\"}"}}],
                    "usage":{"prompt_tokens":100,"completion_tokens":50,"total_tokens":150}}
                    """;
            byte[] bytes=response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json");
            exchange.sendResponseHeaders(200,bytes.length);
            try(var stream=exchange.getResponseBody()){stream.write(bytes);}
        });
        server.start();
        registry.add("budget.voice.base-url",()->"http://127.0.0.1:"+server.getAddress().getPort()+"/v1");
    }
    @AfterAll static void stop() { if(server!=null) server.stop(0); }

    @Test void modelsReceiveSameWavAndOnlyReturnDraft() {
        var audio=ByteBuffer.allocate(32044).order(ByteOrder.LITTLE_ENDIAN);
        audio.put("RIFF".getBytes()).putInt(32036).put("WAVEfmt ".getBytes()).putInt(16)
                .putShort((short)1).putShort((short)1).putInt(16000).putInt(32000)
                .putShort((short)2).putShort((short)16).put("data".getBytes()).putInt(32000);
        for (var path:Voice.Path.values()) {
            var result=voice.interpret(audio.array(),LocalDate.of(2026,11,23), List.of("Restaurantes"),path);
            assertThat(result.draft().amount()).isEqualTo(4290);
            assertThat(result.microUsd()).isPositive().isLessThan(5000);
        }
        assertThat(requests).hasSize(3);
        assertThat(requests.get(0)).contains("gpt-transcribe","gasto.wav","RIFF");
        assertThat(requests.get(1)).contains("gpt-6-luna","42,90");
        assertThat(requests.get(2)).contains("gpt-audio-1.5","input_audio");
    }

    @Test void spendingCapBlocksNextReservationAndRefundsUnusedBalance() {
        var month=budget.reserve(4900000);
        assertThatThrownBy(()->budget.reserve(100001)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        budget.settle(month,4900000,1000);
        assertThat(budget.reserve(4999000)).isEqualTo(month);
    }
}
