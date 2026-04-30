package com.eduardo.budgeting.domain;

import lombok.Getter;

@Getter
public class Transaction {
    private TransactionID id;
    private String description;
    private Long amount;
    private Category category;

    public Transaction(String description, Long amount, Category category) {
        this.id = new TransactionID();
        this.description = description;
        this.category = category;
        this.amount = amount;
    }


}
