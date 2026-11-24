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
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function monthRows(expenses: Expense[], month: string) {
  return expenses
    .filter((row) => row.date.slice(0, 7) === month)
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
