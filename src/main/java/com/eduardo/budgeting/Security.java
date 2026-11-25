package com.eduardo.budgeting;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.session.jdbc.config.annotation.web.http.EnableJdbcHttpSession;

@Configuration
class Security {
    @Bean PasswordEncoder encoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean UserDetailsService accounts(JdbcClient db) {
        return email -> db.sql("select id, password_hash from account where email=lower(trim(:email))")
                .param("email", email)
                .query((rs, i) -> User.withUsername(rs.getString("id"))
                        .password(rs.getString("password_hash")).roles("USER").build())
                .optional().orElseThrow(() -> new UsernameNotFoundException("Conta inválida"));
    }

    @Configuration
    @ConditionalOnWebApplication
    @EnableJdbcHttpSession(maxInactiveIntervalInSeconds = 1209600)
    static class Web {
        @Bean org.springframework.session.web.http.CookieSerializer sessionCookie(
                @org.springframework.beans.factory.annotation.Value("${server.servlet.session.cookie.secure}") boolean secure) {
            var cookie = new org.springframework.session.web.http.DefaultCookieSerializer();
            cookie.setUseSecureCookie(secure);
            cookie.setSameSite("Strict");
            return cookie;
        }

        @Bean SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
            return http.authorizeHttpRequests(r -> r.requestMatchers("/api/session").permitAll()
                            .requestMatchers("/api/**", "/v3/api-docs/**").authenticated()
                            .requestMatchers("/", "/index.html", "/assets/**", "/*.js", "/*.png", "/*.svg",
                                    "/*.webmanifest", "/*.json", "/error").permitAll().anyRequest().denyAll())
                    .requestCache(c -> c.disable())
                    .formLogin(f -> f.loginProcessingUrl("/api/login")
                            .successHandler((req,res,auth) -> res.setStatus(204))
                            .failureHandler((req,res,err) -> res.setStatus(401)))
                    .logout(l -> l.logoutUrl("/api/logout").logoutSuccessHandler((req,res,auth) -> res.setStatus(204)))
                    .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                    .build();
        }
    }
}
