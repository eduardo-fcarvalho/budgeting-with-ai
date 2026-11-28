package com.eduardo.budgeting;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpRequest;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "OPENAI_API_KEY=local-contract-test", "VOICE_PATH=transcription", "server.servlet.session.cookie.secure=false"
})
class VoiceContractTest {
    private static HttpServer server;
    private static final List<String> requests = new CopyOnWriteArrayList<>();
    private static final AtomicBoolean failExtraction = new AtomicBoolean();
    @LocalServerPort int port;
    @Autowired JdbcClient db;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper json;
    @Autowired Voice voice;
    @Autowired VoiceBudget budget;

    @DynamicPropertySource static void provider(DynamicPropertyRegistry registry) throws IOException {
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/v1/", exchange -> {
            String body=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.ISO_8859_1);
            requests.add(body);
            boolean transcription = exchange.getRequestURI().getPath().endsWith("transcriptions");
            boolean failure = !transcription && failExtraction.get();
            String response = failure ? "{}" : transcription ?
                    "{\"text\":\"Ontem paguei 42,90 no restaurante\"}" : """
                    {"id":"chat-test","model":"fixture","created":1,"object":"chat.completion",
                    "choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"{\\"amount\\":4290,\\"category\\":\\"Restaurantes\\",\\"date\\":\\"2026-11-22\\",\\"description\\":\\"Almoço\\"}"}}],
                    "usage":{"prompt_tokens":100,"completion_tokens":50,"total_tokens":150}}
                    """;
            byte[] bytes=response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json");
            exchange.sendResponseHeaders(failure ? 502 : 200, bytes.length);
            try(var stream=exchange.getResponseBody()){stream.write(bytes);}
        });
        server.start();
        registry.add("budget.voice.base-url",()->"http://127.0.0.1:"+server.getAddress().getPort()+"/v1");
    }
    @AfterAll static void stop() { if(server!=null) server.stop(0); }

    @BeforeEach void resetProvider() {
        requests.clear();
        failExtraction.set(false);
    }

    @AfterEach void clearBudget() {
        db.sql("delete from voice_budget").update();
    }

    private static byte[] wav() {
        var audio=ByteBuffer.allocate(32044).order(ByteOrder.LITTLE_ENDIAN);
        audio.put("RIFF".getBytes()).putInt(32036).put("WAVEfmt ".getBytes()).putInt(16)
                .putShort((short)1).putShort((short)1).putInt(16000).putInt(32000)
                .putShort((short)2).putShort((short)16).put("data".getBytes()).putInt(32000);
        return audio.array();
    }

    @Test void modelsReceiveSameWavAndOnlyReturnDraft() {
        for (var path:Voice.Path.values()) {
            var result=voice.interpret(wav(),LocalDate.of(2026,11,23), List.of("Restaurantes"),path);
            assertThat(result.draft().amount()).isEqualTo(4290);
            assertThat(result.microUsd()).isPositive().isLessThan(5000);
        }
        assertThat(requests.size()).isEqualTo(3);
        assertRequest(0, "transcrição de WAV", "gpt-transcribe", "gasto.wav", "RIFF");
        assertRequest(1, "extração a partir da transcrição", "gpt-6-luna", "42,90");
        assertRequest(2, "extração com áudio direto", "gpt-audio-1.5", "input_audio");
    }

    private static void assertRequest(int index, String label, String... expected) {
        assertThat(Arrays.stream(expected).allMatch(requests.get(index)::contains)).as(label).isTrue();
    }

    @Test void spendingCapBlocksNextReservationAndRefundsUnusedBalance() {
        var month=budget.reserve(4900000);
        assertThatThrownBy(()->budget.reserve(100001)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        budget.settle(month,4900000,1000);
        assertThat(budget.reserve(4999000)).isEqualTo(month);
    }

    private DiaryTest.Browser login() throws Exception {
        var account = UUID.randomUUID();
        var browser = new DiaryTest.Browser(port, json);
        browser.login(DiaryTest.seedAccount(db, encoder, account), "test-password", account);
        return browser;
    }

    private static java.net.http.HttpResponse<String> draft(DiaryTest.Browser browser, byte[] audio) throws Exception {
        String boundary = "fixture-boundary";
        var body = HttpRequest.BodyPublishers.concat(
                HttpRequest.BodyPublishers.ofString("--" + boundary + "\r\n"
                        + "Content-Disposition: form-data; name=\"date\"\r\n\r\n2026-11-23\r\n"
                        + "--" + boundary + "\r\n"
                        + "Content-Disposition: form-data; name=\"audio\"; filename=\"gasto.wav\"\r\n"
                        + "Content-Type: audio/wav\r\n\r\n"),
                HttpRequest.BodyPublishers.ofByteArray(audio),
                HttpRequest.BodyPublishers.ofString("\r\n--" + boundary + "--\r\n"));
        return browser.request("POST", "/api/drafts", "multipart/form-data; boundary=" + boundary, body, null);
    }

    @Test void draftEndpointDoesNotWriteAnExpenseOrCategory() throws Exception {
        var browser = login();
        var response = draft(browser, wav());
        assertThat(response.statusCode()).isEqualTo(200);
        var result = json.readTree(response.body());
        assertThat(result.get("amount").asLong()).isEqualTo(4290);
        assertThat(result.get("category").asString()).isEqualTo("Restaurantes");
        assertThat(requests.size()).isEqualTo(2);
        assertThat(browser.read("/api/expenses")).isEqualTo("[]");
        assertThat(browser.read("/api/categories")).isEqualTo("[]");
    }

    @Test void invalidAudioAndExhaustedBudgetNeverReachTheProvider() throws Exception {
        var browser = login();
        assertThat(draft(browser, new byte[44]).statusCode()).isEqualTo(400);
        assertThat(db.sql("select count(*) from voice_budget").query(Integer.class).single()).isZero();
        budget.reserve(5_000_000);
        assertThat(draft(browser, wav()).statusCode()).isEqualTo(429);
        assertThat(requests.size()).isZero();
    }

    @Test void concurrentRequestsShareTheCapAndUnknownCostKeepsTheReservation() throws Exception {
        var first = login();
        var second = login();
        failExtraction.set(true);
        var month = budget.reserve(4_984_000);
        var gate = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Integer> firstDraft = () -> {
                gate.await(5, TimeUnit.SECONDS);
                return draft(first, wav()).statusCode();
            };
            var firstResult = executor.submit(firstDraft);
            var secondResult = executor.submit(() -> {
                gate.await(5, TimeUnit.SECONDS);
                return draft(second, wav()).statusCode();
            });
            assertThat(List.of(firstResult.get(15, TimeUnit.SECONDS), secondResult.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(429, 502);
        }
        assertThat(requests.size()).isEqualTo(2);
        assertThat(db.sql("select micro_usd from voice_budget where month=?").param(month)
                .query(Integer.class).single()).isEqualTo(5_000_000);
    }
}
