import { useState, type CSSProperties } from "react";
import { money } from "./domain";

const charts = [
  { value: "ring", label: "Rosca" },
  { value: "bars", label: "Barras" },
  { value: "pie", label: "Pizza" },
] as const;

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
  const [chart, setChart] = useState<(typeof charts)[number]["value"]>("ring");
  let at = 0;
  const segments = groups.map(([category, value]) => {
    const start = at;
    at += value;
    return `${categoryColor(category)} ${(start / total) * 100}% ${(at / total) * 100}%`;
  });
  const gradient = segments.length
    ? `conic-gradient(${segments.join(", ")})`
    : undefined;

  return (
    <section className="breakdown" aria-labelledby="category-title">
      <div className="heading breakdown-heading">
        <h2 id="category-title">Por categoria</h2>
        <div
          className="segments chart-options"
          role="group"
          aria-label="Tipo de gráfico"
        >
          {charts.map(({ value, label }) => (
            <button
              key={value}
              aria-pressed={chart === value}
              onClick={() => setChart(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {groups.length ? (
        <div className={"breakdown-body chart-" + chart}>
          {chart !== "bars" && (
            <div
              className="circle-chart"
              aria-hidden="true"
              style={{ backgroundImage: gradient }}
            >
              {chart === "ring" && (
                <div className="circle-hole">
                  <b>{groups.length}</b>
                  {groups.length === 1 ? "categoria" : "categorias"}
                </div>
              )}
            </div>
          )}
          <ul className="legend" aria-label="Participação por categoria">
            {groups.map(([category, value]) => {
              const share = value / total;
              return (
                <li key={category}>
                  <button
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
                        <span>
                          {share < 0.001 ? "< 0,1%" : percent.format(share)}
                        </span>
                      </span>
                    </span>
                    {chart === "bars" && (
                      <span className="bar-track" aria-hidden="true">
                        <span
                          className="bar-value"
                          style={{ width: `${share * 100}%` }}
                        />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="breakdown-empty">
          <div className="circle-chart" aria-hidden="true">
            <div className="circle-hole" />
          </div>
          <p>{ready ? "Sem gastos neste período." : "Aguardando histórico."}</p>
        </div>
      )}
    </section>
  );
}
