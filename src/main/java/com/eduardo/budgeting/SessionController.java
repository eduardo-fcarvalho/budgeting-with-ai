package com.eduardo.budgeting;

import java.security.Principal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.*;
import jakarta.servlet.http.*;

@RestController
class SessionController implements WebMvcConfigurer {
    record Session(String user, String csrf) {}
    @GetMapping("/api/session")
    Session session(Principal user, CsrfToken csrf) {
        return new Session(user == null ? null : user.getName(), csrf.getToken());
    }
    @Override public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                String expected = request.getHeader("X-Account-ID");
                Principal principal = request.getUserPrincipal();
                if (expected != null && (principal == null || !expected.equals(principal.getName()))) {
                    response.setStatus(409);
                    return false;
                }
                return true;
            }
        }).addPathPatterns("/api/expenses/**", "/api/categories", "/api/drafts");
    }
}
