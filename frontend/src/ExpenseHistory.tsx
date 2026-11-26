import { useId, useRef, useState } from "react";
import { message } from "./api";
import { CategoryDot, categoryColor } from "./Breakdown";
import { money, type Expense } from "./domain";
import { Icon } from "./Icon";

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "long",
});

export function ExpenseHistory({
  rows,
  ready,
  busy,
  online,
  category,
  onClear,
  onEdit,
  onDelete,
  periodLabel,
  notice,
  recent = false,
  onHistory,
}: {
  rows: Expense[];
  ready: boolean;
  busy: boolean;
  online: boolean;
  category: string | null;
  onClear: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => Promise<void>;
  periodLabel?: string;
  notice?: string;
  recent?: boolean;
  onHistory?: () => void;
}) {
  const title = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const deleteTrigger = useRef<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const matchingRows = query ? rows.filter((row) =>
    [row.description, row.category].some((text) => text.toLocaleLowerCase("pt-BR").includes(query))
  ) : rows;
  const visibleRows = recent ? matchingRows.slice(0, 4) : matchingRows;
  const groups = new Map<string, Expense[]>();

  for (const row of visibleRows) {
    const group = groups.get(row.date);
    if (group) group.push(row);
    else groups.set(row.date, [row]);
  }

  async function remove(id: string) {
    setDeleteError("");
    try {
      await onDelete(id);
      deleteTrigger.current = null;
      setDeleting(null);
      setDeleted(true);
      heading.current?.focus();
    } catch (error) {
      setDeleteError(message(error));
    }
  }

  return (
    <section className="history" aria-labelledby={title}>
      <div className="dashboard-card-heading">
        <h2 id={title} ref={heading} tabIndex={-1}>{recent ? "Gastos recentes" : "Histórico de gastos"}</h2>
        {recent && onHistory ? (
          <button type="button" className="text history-link" onClick={onHistory}>
            Ver histórico <Icon name="arrowRight" />
          </button>
        ) : (
          <span className="history-count" role="status">
            {ready ? `${matchingRows.length} ${matchingRows.length === 1 ? "gasto" : "gastos"}` : "—"}
          </span>
        )}
      </div>
      {!recent && (
        <label className="history-search">
          <span>Buscar no histórico</span>
          <input
            type="search"
            placeholder="Descrição ou categoria"
            value={search}
            disabled={!ready}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </label>
      )}
      {category && (
        <div className="history-filter">
          <span><CategoryDot category={category} /> {category}</span>
          <button type="button" className="text" onClick={onClear}>Limpar filtro</button>
        </div>
      )}
      <div className="history-feedback" role="status">
        {notice || (deleted ? "Gasto excluído." : "")}
      </div>
      {!ready || !visibleRows.length ? (
        <div className="dashboard-empty">
          <span className="dashboard-mark" aria-hidden="true"><Icon name="receipt" /></span>
          <p>
            {!ready
              ? busy ? "Consultando gastos…" : "Nenhuma cópia do histórico disponível."
              : category
                ? "Nenhum gasto nesta categoria no período."
                : query
                  ? "Nenhum gasto corresponde à busca."
                  : `Nenhum gasto em ${periodLabel ?? "seu histórico neste período"}.`}
          </p>
        </div>
      ) : (
        <div className="expense-groups">
          {Array.from(groups, ([date, expenses]) => (
            <div className="expense-day" key={date}>
              <h3><time dateTime={date}>{dateFormat.format(new Date(date + "T12:00:00"))}</time></h3>
              <ul className="expense-list">
                {expenses.map((row) => (
                  <li key={row.id} className="expense-item">
                    <span
                      className="expense-icon"
                      aria-hidden="true"
                      style={{ backgroundColor: `color-mix(in srgb, ${categoryColor(row.category)} 24%, var(--surface))` }}
                    ><Icon name="receipt" /></span>
                    <div className="expense-main">
                      <h4 id={`${title}-${row.id}`}>{row.description}</h4>
                      <span>{row.category}</span>
                    </div>
                    <strong className="expense-amount">{money(row.amount)}</strong>
                    {online && (
                      deleting === row.id ? (
                        <div className="expense-confirm">
                          <span>Excluir este gasto?</span>
                          <button
                            type="button"
                            className="danger"
                            disabled={busy}
                            onClick={() => void remove(row.id)}
                          >Sim, excluir</button>
                          <button
                            type="button"
                            className="text"
                            autoFocus
                            disabled={busy}
                            onClick={() => {
                              setDeleting(null);
                              setDeleteError("");
                            }}
                          >Cancelar</button>
                          {deleteError && <p role="alert">{deleteError}</p>}
                        </div>
                      ) : (
                        <div className="expense-actions">
                          <button
                            type="button"
                            className="text"
                            aria-label="Editar"
                            aria-describedby={`${title}-${row.id}`}
                            disabled={busy}
                            onClick={() => onEdit(row)}
                          ><Icon name="edit" /></button>
                          <button
                            type="button"
                            className="text expense-delete"
                            aria-label="Excluir"
                            aria-describedby={`${title}-${row.id}`}
                            disabled={busy}
                            ref={(button) => {
                              if (button && deleteTrigger.current === row.id) {
                                deleteTrigger.current = null;
                                button.focus();
                              }
                            }}
                            onClick={() => {
                              deleteTrigger.current = row.id;
                              setDeleted(false);
                              setDeleteError("");
                              setDeleting(row.id);
                            }}
                          ><Icon name="trash" /></button>
                        </div>
                      )
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
