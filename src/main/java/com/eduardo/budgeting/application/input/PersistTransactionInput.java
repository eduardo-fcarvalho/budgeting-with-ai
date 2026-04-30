package com.eduardo.budgeting.application.input;

import com.eduardo.budgeting.domain.Category;

public record PersistTransactionInput(String description, Long amount, Category category) {
}
