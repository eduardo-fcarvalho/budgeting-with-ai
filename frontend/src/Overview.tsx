import { Icon } from "./Icon";
import { localDate, money, movePeriod, periodBounds, periodRows, type Expense, type Period } from "./domain";
import "./dashboard.css";

const periodOptions = [
  { value: "day", label: "Diário", previous: "Dia anterior", next: "Próximo dia" },
  { value: "week", label: "Semanal", previous: "Semana anterior", next: "Próxima semana" },
  { value: "month", label: "Mensal", previous: "Mês anterior", next: "Próximo mês" },
  { value: "year", label: "Anual", previous: "Ano anterior", next: "Próximo ano" },
] as const;

const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const weekFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });
const dayFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" });

export function periodName(period: Period, date: string) {
  const { start, end } = periodBounds(period, date);
  if (period === "year") return String(start.getFullYear());
  if (period === "month") return monthFormat.format(start);
  if (period === "week") return weekFormat.formatRange(start, end);
  return dayFormat.format(start);
}

type PeriodProps = {
  period: Period;
  date: string;
  onPeriod: (period: Period) => void;
  onDate: (date: string) => void;
};

export function PeriodControls({ period, date, onPeriod, onDate }: PeriodProps) {
  const labels = periodOptions.find(({ value }) => value === period)!;
  const periodLabel = periodName(period, date);

  return (
    <div className="period-controls">
      <div className="period-navigation">
        <button
          type="button"
          className="period-step"
          aria-label={labels.previous}
          onClick={() => onDate(movePeriod(period, date, -1))}
        >
          <Icon name="chevronLeft" />
        </button>
        {period === "month" ? (
          <label className="current-period month-picker">
            <Icon name="calendar" />
            <span aria-live="polite">{periodLabel}</span>
            <input
              type="month"
              value={date.slice(0, 7)}
              min="0001-01"
              max="9999-12"
              aria-label="Selecionar mês"
              onChange={(event) => {
                const month = event.currentTarget.value;
                if (/^(?!0000)[0-9]{4}-(?:0[1-9]|1[0-2])$/.test(month))
                  onDate(month + "-01");
              }}
            />
          </label>
        ) : (
          <span className="current-period" aria-live="polite">{periodLabel}</span>
        )}
        <button
          type="button"
          className="period-step"
          aria-label={labels.next}
          onClick={() => onDate(movePeriod(period, date, 1))}
        >
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="period-options" role="group" aria-label="Período">
        {periodOptions.map(({ value, label }) => (
          <button
            type="button"
            key={value}
            aria-pressed={period === value}
            onClick={() => onPeriod(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function monthComparison(expenses: Expense[], rows: Expense[], date: string, total: number) {
  const today = localDate();
  const month = date.slice(0, 7);
  const currentMonth = today.slice(0, 7);
  if (month > currentMonth) return null;

  const previousDate = movePeriod("month", date, -1);
  if (previousDate === date) return null;
  const previousRows = periodRows(expenses, "month", previousDate);
  if (!previousRows.length) return null;

  const cutoff = month === currentMonth
    ? Math.min(Number(today.slice(8)), periodBounds("month", previousDate).end.getDate())
    : null;
  const sumThrough = (entries: Expense[]) => entries.reduce(
    (sum, row) => cutoff === null || Number(row.date.slice(8)) <= cutoff ? sum + row.amount : sum,
    0,
  );
  const change = (cutoff === null ? total : sumThrough(rows)) - sumThrough(previousRows);

  if (cutoff === null) return change === 0
    ? "Mesmo total do mês anterior"
    : `${money(Math.abs(change))} a ${change > 0 ? "mais" : "menos"} que no mês anterior`;

  return change === 0
    ? `Até o dia ${cutoff}, o total é igual ao do mesmo intervalo do mês anterior`
    : `Até o dia ${cutoff}, ${money(Math.abs(change))} a ${change > 0 ? "mais" : "menos"} que no mesmo intervalo do mês anterior`;
}

export function Overview({
  expenses,
  rows,
  total,
  ready,
  busy,
  ...controls
}: PeriodProps & {
  expenses: Expense[];
  rows: Expense[];
  total: number;
  ready: boolean;
  busy: boolean;
}) {
  const loading = busy && !ready;
  const comparison = ready && controls.period === "month"
    ? monthComparison(expenses, rows, controls.date, total)
    : null;
  return (
    <section className="summary" aria-label="Resumo do período">
      <PeriodControls {...controls} />
      <h2>{controls.period === "month" ? "Gastos do mês" : "Gastos no período"}</h2>
      <strong key={ready ? total : "unavailable"} className={loading ? "amount-skeleton" : undefined}>
        {ready ? money(total) : "—"}
      </strong>
      <div className="summary-meta">
        <span className="period-count" role="status">
          <Icon name="receipt" />
          {ready
            ? `${rows.length} ${rows.length === 1 ? "gasto registrado" : "gastos registrados"}`
            : loading ? "Consultando gastos…" : "Histórico indisponível"}
        </span>
        {comparison && <span className="previous-total">{comparison}</span>}
      </div>
    </section>
  );
}
