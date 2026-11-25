package com.eduardo.budgeting;

import com.eduardo.budgeting.domain.Category;
import com.eduardo.budgeting.infrastructure.persistence.repository.TransactionEntityRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named = "OPENAI_API_KEY", matches = ".*")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TransactionAiFlowIT {

    private static final Logger log = LoggerFactory.getLogger(TransactionAiFlowIT.class);

    @Autowired
    TransactionEntityRepository transactionEntityRepository;

    @LocalServerPort
    int port;

    @Autowired
    ObjectMapper objectMapper;

    private final List<AuditEntry> auditLog = new CopyOnWriteArrayList<>();

    @BeforeEach
    void cleanDatabase() {
        transactionEntityRepository.deleteAll();
    }

    @ParameterizedTest
    @MethodSource("audioTransactions")
    void should_persistExpectedTransaction_when_audioIsSent(String audioFile, String description, Long amount, Category category) throws Exception {
        var file = new ClassPathResource("audio/" + audioFile);
        if (!file.exists()) {
            auditLog.add(new AuditEntry(audioFile, TestStatus.SKIPPED, "Arquivo ausente"));
            Assumptions.assumeTrue(false, "Audio file not found: " + audioFile);
            return;
        }

        try {
            var headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            var body = new LinkedMultiValueMap<String, Object>();
            body.add("file", new ByteArrayResource(file.getInputStream().readAllBytes()) {
                @Override
                public String getFilename() {
                    return audioFile;
                }
            });

            var request = new HttpEntity<>(body, headers);
            var response = new RestTemplate().postForEntity("http://localhost:" + port + "/transactions/ai", request, String.class);

            Assertions.assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();

            var persisted = StreamSupport.stream(transactionEntityRepository.findAll().spliterator(), false).toList();
            Assertions.assertThat(persisted).hasSize(1);

            var actual = persisted.getFirst();
            Assertions.assertThat(description.trim().equalsIgnoreCase(actual.getDescription())).isTrue();
            Assertions.assertThat(actual.getAmount()).isEqualTo(amount);
            Assertions.assertThat(actual.getCategory()).isEqualTo(category);

            auditLog.add(new AuditEntry(audioFile, TestStatus.PASSED, "-"));
        } catch (Throwable t) {
            auditLog.add(new AuditEntry(audioFile, TestStatus.FAILED, t.getClass().getSimpleName()));
            throw new AssertionError("Falha no caso " + audioFile + " (" + t.getClass().getSimpleName() + ")");
        }
    }

    @AfterAll
    void generateAuditReport() {
        long total = auditLog.size();
        long passed = auditLog.stream().filter(e -> e.status() == TestStatus.PASSED).count();
        long failed = auditLog.stream().filter(e -> e.status() == TestStatus.FAILED).count();
        long skipped = auditLog.stream().filter(e -> e.status() == TestStatus.SKIPPED).count();
        long executed = passed + failed;
        double accuracy = executed > 0 ? ((double) passed / executed) * 100.0 : 0.0;

        StringBuilder report = new StringBuilder();
        report.append("\n========================================================================================================================\n");
        report.append("                                        TRANSACTION AI FLOW AUDIT REPORT                                        \n");
        report.append("========================================================================================================================\n");
        report.append(String.format("Total Configured Cases : %d%n", total));
        report.append(String.format("Total Executed         : %d%n", executed));
        report.append(String.format("Passed                 : %d%n", passed));
        report.append(String.format("Failed                 : %d%n", failed));
        report.append(String.format("Skipped (Missing file) : %d%n", skipped));
        report.append(String.format("Accuracy Rate          : %.2f%%%n", accuracy));
        report.append("========================================================================================================================\n");
        for (AuditEntry entry : auditLog) {
            report.append(String.format("%-8s | %-16s | %s%n", entry.status(), entry.audioFile(), entry.failureReason()));
        }
        log.info("{}", report);
    }

    Stream<Arguments> audioTransactions() throws IOException {
        var resource = new ClassPathResource("audio-transactions.json");
        try (InputStream inputStream = resource.getInputStream()) {
            var entries = objectMapper.readValue(inputStream, new TypeReference<List<AudioTransactionCase>>() {
            });
            return entries.stream()
                    .map(entry -> Arguments.of(entry.audioFile(), entry.description(), entry.amount(), entry.category()));
        }
    }

    enum TestStatus {
        PASSED,
        FAILED,
        SKIPPED
    }

    record AuditEntry(String audioFile, TestStatus status, String failureReason) {}

    record AudioTransactionCase(String audioFile, String description, Long amount, Category category) {
    }
}
