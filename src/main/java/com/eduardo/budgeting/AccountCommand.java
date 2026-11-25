package com.eduardo.budgeting;

import java.util.Arrays;
import java.util.Locale;
import java.util.UUID;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@ConditionalOnProperty(name="budget.account")
class AccountCommand implements ApplicationRunner {
    private final JdbcClient db;
    private final PasswordEncoder passwords;
    AccountCommand(JdbcClient db, PasswordEncoder passwords) { this.db = db; this.passwords = passwords; }
    @Override @Transactional public void run(ApplicationArguments args) {
        var console = System.console();
        if (console == null) throw new IllegalStateException("Use um terminal interativo.");
        String email = console.readLine("E-mail: ").trim().toLowerCase(Locale.ROOT);
        if (email.length() > 254 || !email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+"))
            throw new IllegalArgumentException("E-mail inválido");
        char[] password = console.readPassword("Senha (mínimo de 12 caracteres): ");
        try {
            if (password.length < 12 || new String(password).getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72)
                throw new IllegalArgumentException("Use 12 caracteres ou mais e até 72 bytes.");
            var mode = args.getOptionValues("budget.account").getFirst();
            String hash = passwords.encode(new String(password));
            if ("create".equals(mode)) {
                int inserted = db.sql("insert into account(id,email,password_hash) values(?,?,?) on conflict (email) do nothing")
                        .params(UUID.randomUUID(), email, hash).update();
                if (inserted == 0) throw new IllegalArgumentException("Esta conta já existe.");
            } else if ("reset".equals(mode)) {
                var id = db.sql("update account set password_hash=? where email=? returning id")
                        .params(hash,email).query(UUID.class).single();
                db.sql("delete from spring_session where principal_name=?").param(id.toString()).update();
            } else throw new IllegalArgumentException("Use create ou reset.");
        } finally {
            Arrays.fill(password, '\0');
        }
    }
}
