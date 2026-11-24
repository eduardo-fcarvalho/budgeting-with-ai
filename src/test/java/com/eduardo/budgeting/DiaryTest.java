package com.eduardo.budgeting;

import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties="server.servlet.session.cookie.secure=false")
class DiaryTest {
    @LocalServerPort int port;
    @Autowired JdbcClient db;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper json;
    @Autowired VoiceBudget budget;

    class Browser {
        final HttpClient http = HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
        String token;
        HttpResponse<String> request(String method,String path,String type,String body,String expected) throws Exception {
            var req=HttpRequest.newBuilder(URI.create("http://localhost:"+port+path))
                    .header("Content-Type",type).method(method,HttpRequest.BodyPublishers.ofString(body));
            if (token!=null) req.header("X-CSRF-TOKEN",token);
            if (expected!=null) req.header("X-Account-ID",expected);
            return http.send(req.build(),HttpResponse.BodyHandlers.ofString());
        }
        String read(String path) throws Exception {
            var res=request("GET",path,"application/json","",null);
            assertThat(res.statusCode()).isEqualTo(200);
            return res.body();
        }
        void login(UUID id) throws Exception {
            String email=id+"@example.test";
            db.sql("insert into account values(?,?,?)").params(id,email,encoder.encode("test-password")).update();
            token=json.readTree(read("/api/session")).get("csrf").asString();
            assertThat(request("POST","/api/login","application/x-www-form-urlencoded",
                    "username="+email+"&password=test-password",null).statusCode()).isEqualTo(204);
            var session=json.readTree(read("/api/session"));
            assertThat(session.get("user").asString()).isEqualTo(id.toString());
            token=session.get("csrf").asString();
        }
    }

    @Test void twoPeopleCanOnlyManageTheirOwnDiary() throws Exception {
        var a=new Browser();
        var b=new Browser();
        UUID first=UUID.randomUUID(), second=UUID.randomUUID(), entry=UUID.randomUUID();
        String url="/api/expenses", item=url+"/"+entry;
        String expense=json.writeValueAsString(new Expenses.Expense(entry,"Almoço",4290L,LocalDate.now(),"Restaurantes"));
        assertThat(a.request("GET",url,"application/json","",null).statusCode()).isEqualTo(401);
        a.login(first);
        b.login(second);
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

    @Test void invalidAudioNeverReachesProvider() {
        assertThatThrownBy(()->Voice.millis(new byte[44])).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
