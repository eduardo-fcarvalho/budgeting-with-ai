package com.eduardo.budgeting.application.input;

import com.eduardo.budgeting.domain.Category;
import org.springframework.ai.tool.annotation.ToolParam;

public record PersistTransactionInput(@ToolParam(description = "Descrição do gasto") String description,
                                      @ToolParam(description = "Valor do gasto em centavos") Long amount,
                                      @ToolParam(description = "Categoria de uma transação") Category category) {
}
