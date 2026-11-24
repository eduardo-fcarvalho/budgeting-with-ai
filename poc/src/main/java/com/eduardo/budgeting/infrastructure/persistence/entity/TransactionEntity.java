package com.eduardo.budgeting.infrastructure.persistence.entity;

import com.eduardo.budgeting.domain.Category;
import com.eduardo.budgeting.domain.Transaction;
import com.eduardo.budgeting.domain.TransactionID;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Entity
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TransactionEntity {

    @Id
    private UUID id;
    private String description;
    private Long amount;

    @Enumerated(EnumType.STRING)
    private Category category;

    public static TransactionEntity from(Transaction transaction) {
        return new TransactionEntity(
                transaction.getId().uuid(),
                transaction.getDescription(),
                transaction.getAmount(),
                transaction.getCategory());
    }

    public Transaction toDomain() {
        return new Transaction(
               new TransactionID(this.id),
                this.description,
                this.amount,
                this.category
        );
    }
}
