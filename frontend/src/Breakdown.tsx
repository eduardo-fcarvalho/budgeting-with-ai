import { useId, type CSSProperties } from "react";
import { money } from "./domain";
import { Icon } from "./Icon";

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
  return `hsl(${color % 360} 63% ${48 + ((color >>> 16) % 3) * 6}%)`;
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
  selected?: string | null;
  onSelect: (category: string) => void;
  ready: boolean;
}) {
  const title = useId();
  const opensHistory = selected === undefined;
  const showDonut = total > 0 && groups.length <= 5;
  let cumulative = 0;
  const segments = showDonut
    ? groups.map(([category, value]) => {
      const start = cumulative;
      cumulative += value;
      return `${categoryColor(category)} ${start / total * 100}% ${cumulative / total * 100}%`;
    }).join(", ")
    : "";

  return (
    <section className="breakdown" aria-labelledby={title}>
      <div className="dashboard-card-heading">
        <h2 id={title}>Por categoria</h2>
        <span className="dashboard-mark" aria-hidden="true"><Icon name="chart" /></span>
      </div>
      {groups.length ? (
        <div className={showDonut ? "breakdown-content with-donut" : "breakdown-content"}>
          {showDonut && (
            <div
              key={segments}
              className="category-donut"
              style={{ backgroundImage: `conic-gradient(${segments})` }}
              aria-hidden="true"
            >
              <span><b>{groups.length}</b>{groups.length === 1 ? "categoria" : "categorias"}</span>
            </div>
          )}
          <ul className="legend" aria-label="Participação por categoria">
            {groups.map(([category, value]) => {
              const share = value / total;
              const amount = money(value);
              const shareLabel = share < 0.001 ? "< 0,1%" : percent.format(share);
              return (
                <li key={category}>
                  <button
                    type="button"
                    className="legend-item"
                    aria-label={opensHistory ? `Ver gastos de ${category} no histórico, ${amount}, ${shareLabel}` : undefined}
                    aria-pressed={opensHistory ? undefined : selected === category}
                    onClick={() => onSelect(category)}
                    style={{ "--category-color": categoryColor(category) } as CSSProperties}
                  >
                    <span className="legend-details">
                      <span className="legend-category">
                        <CategoryDot category={category} />
                        <span>{category}</span>
                      </span>
                      <span className="legend-amount">
                        <b>{amount}</b>
                        <span>{shareLabel}</span>
                      </span>
                      {opensHistory && <Icon name="chevronRight" size={14} className="legend-next" />}
                    </span>
                    {!showDonut && (
                      <span className="bar-track" aria-hidden="true">
                        <span
                          className="bar-value"
                          style={{ "--share": share } as CSSProperties}
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
        <div className="dashboard-empty">
          <span className="dashboard-mark" aria-hidden="true"><Icon name="chart" /></span>
          <p>{ready ? "Sem gastos neste período." : "Aguardando histórico."}</p>
        </div>
      )}
    </section>
  );
}
