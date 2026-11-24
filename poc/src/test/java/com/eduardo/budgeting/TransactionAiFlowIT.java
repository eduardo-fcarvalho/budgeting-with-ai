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
            auditLog.add(new AuditEntry(
                    audioFile, description, amount, category,
                    null, null, null,
                    TestStatus.SKIPPED, "Audio file not found in test resources"
            ));
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
            Assertions.assertThat(actual.getDescription()).isEqualToIgnoringCase(description.trim());
            Assertions.assertThat(actual.getAmount()).isEqualTo(amount);
            Assertions.assertThat(actual.getCategory()).isEqualTo(category);

            auditLog.add(new AuditEntry(
                    audioFile, description, amount, category,
                    actual.getDescription(), actual.getAmount(), actual.getCategory(),
                    TestStatus.PASSED, null
            ));
        } catch (Throwable t) {
            var persistedList = StreamSupport.stream(transactionEntityRepository.findAll().spliterator(), false).toList();
            String actualDesc = persistedList.isEmpty() ? null : persistedList.getFirst().getDescription();
            Long actualAmt = persistedList.isEmpty() ? null : persistedList.getFirst().getAmount();
            Category actualCat = persistedList.isEmpty() ? null : persistedList.getFirst().getCategory();

            auditLog.add(new AuditEntry(
                    audioFile, description, amount, category,
                    actualDesc, actualAmt, actualCat,
                    TestStatus.FAILED, t.getMessage()
            ));
            throw t;
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
        report.append(String.format("%-8s | %-16s | %-38s | %-38s | %s%n", "STATUS", "AUDIO FILE", "EXPECTED (Desc, Amt, Cat)", "ACTUAL (Desc, Amt, Cat)", "DETAILS"));
        report.append("------------------------------------------------------------------------------------------------------------------------\n");

        for (AuditEntry entry : auditLog) {
            String expected = String.format("%s, %d, %s", entry.expectedDescription(), entry.expectedAmount(), entry.expectedCategory());
            String actual = entry.actualDescription() != null
                    ? String.format("%s, %d, %s", entry.actualDescription(), entry.actualAmount(), entry.actualCategory())
                    : "-";
            String details = entry.failureReason() != null ? entry.failureReason().replace('\n', ' ') : "-";

            report.append(String.format("%-8s | %-16s | %-38s | %-38s | %s%n",
                    entry.status(),
                    entry.audioFile(),
                    truncate(expected, 38),
                    truncate(actual, 38),
                    truncate(details, 50)));
        }
        report.append("========================================================================================================================\n");

        log.info("{}", report);
        System.out.println(report);
    }

    private static String truncate(String str, int maxLen) {
        if (str == null) return "";
        return str.length() <= maxLen ? str : str.substring(0, maxLen - 3) + "...";
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

    record AuditEntry(
            String audioFile,
            String expectedDescription,
            Long expectedAmount,
            Category expectedCategory,
            String actualDescription,
            Long actualAmount,
            Category actualCategory,
            TestStatus status,
            String failureReason
    ) {
    }

    record AudioTransactionCase(String audioFile, String description, Long amount, Category category) {
    }
}
