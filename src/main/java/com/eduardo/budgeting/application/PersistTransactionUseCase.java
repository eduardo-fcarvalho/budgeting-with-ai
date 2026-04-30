package com.eduardo.budgeting.application;

import com.eduardo.budgeting.application.input.PersistTransactionInput;
import com.eduardo.budgeting.application.output.TransactionOutput;
import com.eduardo.budgeting.domain.Category;
import com.eduardo.budgeting.domain.Transaction;
import com.eduardo.budgeting.domain.TransactionRepository;

public class PersistTransactionUseCase {
    private final TransactionRepository transactionRepository;

    public PersistTransactionUseCase(TransactionRepository transactionRepository) {
        this.transactionRepository = transactionRepository;
    }

    public TransactionOutput execute(PersistTransactionInput input) {
        var transaction = transactionRepository.save(
                new Transaction(input.description(), input.amount(), input.category()));

        return TransactionOutput.from(transaction);
    }
}
