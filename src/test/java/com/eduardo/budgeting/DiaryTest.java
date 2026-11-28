package com.eduardo.budgeting;

import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties="server.servlet.session.cookie.secure=false")
class DiaryTest {
    @LocalServerPort int port;
    @Autowired JdbcClient db;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper json;
    @Autowired TransactionTemplate transactions;

    static final class Browser {
        final HttpClient http = HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
        final int port;
        final ObjectMapper json;
        String token;

        Browser(int port, ObjectMapper json) {
            this.port = port;
            this.json = json;
        }

        HttpResponse<String> request(String method,String path,String type,String body,String expected) throws Exception {
            return request(method, path, type, HttpRequest.BodyPublishers.ofString(body), expected);
        }

        HttpResponse<String> request(String method, String path, String type, HttpRequest.BodyPublisher body,
                                     String expected) throws Exception {
            var req=HttpRequest.newBuilder(URI.create("http://localhost:"+port+path))
                    .timeout(Duration.ofSeconds(10)).header("Content-Type",type).method(method,body);
            if (token!=null) req.header("X-CSRF-TOKEN",token);
            if (expected!=null) req.header("X-Account-ID",expected);
            return http.send(req.build(),HttpResponse.BodyHandlers.ofString());
        }
        String read(String path) throws Exception {
            var res=request("GET",path,"application/json","",null);
            assertThat(res.statusCode()).isEqualTo(200);
            return res.body();
        }
        int authenticate(String email, String password) throws Exception {
            token=json.readTree(read("/api/session")).get("csrf").asString();
            return request("POST","/api/login","application/x-www-form-urlencoded",
                    "username="+email+"&password="+password,null).statusCode();
        }

        void login(String email, String password, UUID id) throws Exception {
            assertThat(authenticate(email, password)).isEqualTo(204);
            var session=json.readTree(read("/api/session"));
            assertThat(session.get("user").asString()).isEqualTo(id.toString());
            token=session.get("csrf").asString();
        }
    }

    static String seedAccount(JdbcClient db, PasswordEncoder encoder, UUID id) {
        String email = id + "@example.test";
        db.sql("insert into account values(?,?,?)").params(id,email,encoder.encode("test-password")).update();
        return email;
    }

    private Browser login(UUID account) throws Exception {
        var browser = new Browser(port, json);
        browser.login(seedAccount(db, encoder, account), "test-password", account);
        return browser;
    }

    @Test void twoPeopleCanOnlyManageTheirOwnDiary() throws Exception {
        var anonymous = new Browser(port, json);
        UUID first=UUID.randomUUID(), second=UUID.randomUUID(), entry=UUID.randomUUID();
        String url="/api/expenses", item=url+"/"+entry;
        String expense=json.writeValueAsString(new Expenses.Expense(entry,"Almoço",4290L,LocalDate.now(),"Restaurantes"));
        assertThat(anonymous.request("GET",url,"application/json","",null).statusCode()).isEqualTo(401);
        var a = login(first);
        var b = login(second);
        assertThat(a.read("/v3/api-docs")).contains("/api/drafts");
        assertThat(a.request("GET",url,"application/json","",second.toString()).statusCode()).isEqualTo(409);
        var token=a.token;
        a.token=null;
        assertThat(a.request("POST",url,"application/json",expense,null).statusCode()).isEqualTo(403);
        a.token=token;
        for(int retry=0; retry<2; retry++)
            assertThat(a.request("POST",url,"application/json",expense,null).statusCode()).isEqualTo(201);
        assertThat(json.readTree(a.read(url)).size()).isEqualTo(1);
        assertThat(a.read("/api/categories")).contains("Restaurantes");
        assertThat(b.read(url)).isEqualTo("[]");
        assertThat(b.request("PUT",item,"application/json",expense,null).statusCode()).isEqualTo(404);
        assertThat(b.read("/api/categories")).isEqualTo("[]");
        assertThat(b.request("DELETE",item,"application/json","",null).statusCode()).isEqualTo(404);
        assertThat(a.request("PUT",item,"application/json",expense.replace("4290","4500"),null).body()).contains("4500");
        assertThat(a.request("DELETE",item,"application/json","",null).statusCode()).isEqualTo(204);
        assertThat(a.read(url)).isEqualTo("[]");
        assertThat(a.request("POST","/api/logout","application/json","",null).statusCode()).isEqualTo(204);
        assertThat(a.request("GET",url,"application/json","",null).statusCode()).isEqualTo(401);
    }

    @Test void passwordResetRevokesEverySessionOfThatAccount() throws Exception {
        var command = new AccountCommand(db, encoder);
        String email = UUID.randomUUID() + "@example.test";
        String previous = "senha-ficticia-1";
        String replacement = "senha-ficticia-2";
        transactions.executeWithoutResult(tx -> command.updateAccount("create", email, previous.toCharArray()));
        UUID account = db.sql("select id from account where email=?").param(email).query(UUID.class).single();
        assertThat(new Browser(port, json).authenticate(email, "senha-incorreta")).isEqualTo(401);

        var first = new Browser(port, json);
        var second = new Browser(port, json);
        first.login(email, previous, account);
        second.login(email, previous, account);
        var other = login(UUID.randomUUID());

        transactions.executeWithoutResult(tx -> command.updateAccount("reset", email, replacement.toCharArray()));

        for (var revoked : List.of(first, second)) {
            assertThat(revoked.request("GET", "/api/expenses", "application/json", "", null).statusCode())
                    .isEqualTo(401);
        }
        assertThat(other.read("/api/expenses")).isEqualTo("[]");
        assertThat(new Browser(port, json).authenticate(email, previous)).isEqualTo(401);
        new Browser(port, json).login(email, replacement, account);
    }

    @ParameterizedTest
    @ValueSource(longs = {0, 100_000_000_000L})
    void invalidAmountsDoNotCreateExpensesOrCategories(long amount) throws Exception {
        var browser = login(UUID.randomUUID());
        String body = json.writeValueAsString(
                new Expenses.Expense(UUID.randomUUID(), "Gasto fictício", amount, LocalDate.now(), "Mercado"));
        assertThat(browser.request("POST", "/api/expenses", "application/json", body, null).statusCode())
                .isEqualTo(400);
        assertThat(browser.read("/api/expenses")).isEqualTo("[]");
        assertThat(browser.read("/api/categories")).isEqualTo("[]");
    }

    @Test void conflictingRetryLeavesTheFirstExpenseAndRollsBackTheNewCategory() throws Exception {
        var browser = login(UUID.randomUUID());
        UUID id = UUID.randomUUID();
        LocalDate date = LocalDate.now();
        String original = json.writeValueAsString(new Expenses.Expense(id, "Gasto fictício", 4290L, date, "Mercado"));
        String conflict = json.writeValueAsString(new Expenses.Expense(id, "Gasto alterado", 5000L, date, "Outro"));

        assertThat(browser.request("POST", "/api/expenses", "application/json", original, null).statusCode())
                .isEqualTo(201);
        assertThat(browser.request("POST", "/api/expenses", "application/json", conflict, null).statusCode())
                .isEqualTo(409);
        var expenses = json.readTree(browser.read("/api/expenses"));
        assertThat(expenses.size()).isEqualTo(1);
        assertThat(expenses.get(0).get("amount").asLong()).isEqualTo(4290);
        assertThat(browser.read("/api/categories")).isEqualTo("[\"Mercado\"]");
    }
}
