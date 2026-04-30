package com.eduardo.budgeting.domain;

import java.util.UUID;

public record TransactionID(UUID uuid) {
    public TransactionID() {
        this(UUID.randomUUID());
    }
}
