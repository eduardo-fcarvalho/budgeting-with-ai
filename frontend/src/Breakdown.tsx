import type { CSSProperties } from "react";
import { money } from "./domain";

const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function categoryColor(category: string) {
  let hash = 2166136261;
  for (const letter of category) {
    hash = Math.imul(hash ^ letter.codePointAt(0)!, 16777619);
  }
  const color = hash >>> 0;
  return `hsl(${color % 360} 58% ${42 + ((color >>> 16) % 3) * 8}%)`;
}

export function CategoryDot({ category }: { category: string }) {
  return (
    <span
      aria-hidden="true"
      className="category-dot"
      style={{ backgroundColor: categoryColor(category) }}
    />
  );
}

export function Breakdown({
  groups,
  total,
  selected,
  onSelect,
  ready,
}: {
  groups: [string, number][];
  total: number;
  selected: string | null;
  onSelect: (category: string | null) => void;
  ready: boolean;
}) {
  return (
    <section className="breakdown" aria-labelledby="category-title">
      <div className="heading">
        <h2 id="category-title">Por categoria</h2>
      </div>
      {groups.length ? (
        <ul className="legend" aria-label="Participação por categoria">
          {groups.map(([category, value]) => {
            const share = value / total;
            return (
              <li key={category}>
                <button
                  type="button"
                  className="legend-item"
                  aria-pressed={selected === category}
                  onClick={() =>
                    onSelect(selected === category ? null : category)
                  }
                  style={{
                    "--category-color": categoryColor(category),
                  } as CSSProperties}
                >
                  <span className="legend-details">
                    <span className="legend-category">
                      <CategoryDot category={category} />
                      {category}
                    </span>
                    <span className="legend-amount">
                      <b>{money(value)}</b>
                      <span>{share < 0.001 ? "< 0,1%" : percent.format(share)}</span>
                    </span>
                  </span>
                  <span className="bar-track" aria-hidden="true">
                    <span
                      className="bar-value"
                      style={{ width: `${share * 100}%` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="breakdown-empty">
          {ready ? "Sem gastos neste período." : "Aguardando histórico."}
        </p>
      )}
    </section>
  );
}
