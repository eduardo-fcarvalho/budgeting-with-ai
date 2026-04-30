package com.eduardo.budgeting.infrastructure.http.request;

import com.eduardo.budgeting.application.input.PersistTransactionInput;
import com.eduardo.budgeting.domain.Category;

public record TransactionRequest(String description, Category category, Long amount) {
    public PersistTransactionInput toInput() {
        return new PersistTransactionInput(description, amount, category);
    }
}
