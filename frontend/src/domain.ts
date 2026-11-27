export type Expense = {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
};
export type Draft = {
  description: string | null;
  amount: number | null;
  date: string | null;
  category: string | null;
};
export type Snapshot = {
  expenses: Expense[];
  categories: string[];
  syncedAt: string;
};
export const money = (amount: number) =>
  (amount / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export function cents(value: string): number | null {
  const parts = /^(\d{1,9})(?:[,.](\d{1,2}))?$/.exec(value.trim());
  if (!parts) return null;
  const result =
    Number(parts[1]) * 100 + Number((parts[2] || "").padEnd(2, "0"));
  return result > 0 && Number.isSafeInteger(result) ? result : null;
}

export function localDate(d = new Date()) {
  return [
    String(d.getFullYear()).padStart(4, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export type Period = "day" | "week" | "month" | "year";

function periodStart(period: Period, date: string) {
  const start = new Date(date + "T12:00:00");
  if (period === "year") start.setMonth(0, 1);
  if (period === "month") start.setDate(1);
  if (period === "week")
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function shiftPeriod(start: Date, period: Period, step: number) {
  const date = new Date(start);
  if (period === "year") date.setFullYear(date.getFullYear() + step);
  else if (period === "month") date.setMonth(date.getMonth() + step);
  else date.setDate(date.getDate() + step * (period === "week" ? 7 : 1));
  return date;
}

export function movePeriod(period: Period, date: string, step: number) {
  const next = shiftPeriod(periodStart(period, date), period, step);
  return next.getFullYear() < 1 || next.getFullYear() > 9999
    ? date
    : localDate(next);
}

export function periodBounds(period: Period, date: string) {
  const start = periodStart(period, date);
  const end = shiftPeriod(start, period, 1);
  end.setDate(end.getDate() - 1);
  if (end.getFullYear() > 9999) end.setFullYear(9999, 11, 31);
  return { start, end };
}

export function periodRows(expenses: Expense[], period: Period, date: string) {
  const { start, end } = periodBounds(period, date);
  const from = localDate(start);
  const through = localDate(end);
  return expenses
    .filter((row) => row.date >= from && row.date <= through)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.description.localeCompare(b.description, "pt-BR"),
    );
}

export function totals(rows: Expense[]) {
  const groups = new Map<string, number>();
  for (const row of rows)
    groups.set(row.category, (groups.get(row.category) || 0) + row.amount);
  return [...groups].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"),
  );
}
