package com.eduardo.budgeting;

import java.time.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
record VoiceBudget(JdbcClient db) {
    LocalDate reserve(int maximum) {
        var month = LocalDate.now(ZoneOffset.UTC).withDayOfMonth(1);
        int rows = db.sql("""
                insert into voice_budget(month,micro_usd) values(?,?)
                on conflict (month) do update set micro_usd=voice_budget.micro_usd+excluded.micro_usd
                where voice_budget.micro_usd+excluded.micro_usd <= 5000000
                """).params(month, maximum).update();
        if (rows == 0) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS);
        return month;
    }
    void settle(LocalDate month, int maximum, int actual) {
        if (actual < 0 || actual > maximum) throw new IllegalStateException("Uso fora da faixa prevista");
        db.sql("update voice_budget set micro_usd=micro_usd-? where month=?")
                .params(maximum-actual, month).update();
    }
}
