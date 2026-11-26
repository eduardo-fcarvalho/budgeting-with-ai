import { Fragment, type ReactNode } from "react";
import { Icon } from "./Icon";
import "./shell.css";

const destinations = [
  { id: "home", label: "Início", icon: "home" },
  { id: "history", label: "Histórico", icon: "history" },
  { id: "analytics", label: "Análises", icon: "chart" },
  { id: "settings", label: "Ajustes", icon: "settings" },
] as const;

export type Screen = (typeof destinations)[number]["id"];

export function Brand() {
  return (
    <div className="brand">
      <img src="/icon-192.png" alt="" width="36" height="36" />
      <span>Diário de gastos</span>
    </div>
  );
}

export function AppShell({
  screen,
  onNavigate,
  onNew,
  online,
  busy,
  children,
}: {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  onNew: () => void;
  online: boolean;
  busy: boolean;
  children: ReactNode;
}) {
  const create = (placement: "mobile" | "desktop") => (
    <button
      type="button"
      className={`shell-new shell-new-${placement}`}
      aria-label="Novo gasto"
      aria-haspopup="dialog"
      disabled={!online || busy}
      onClick={onNew}
    >
      <span className="shell-new-icon"><Icon name="plus" /></span>
      <span>{placement === "mobile" ? "Novo" : "Novo gasto"}</span>
    </button>
  );

  return (
    <div className="app-shell">
      <a
        className="shell-skip"
        href="#diario"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("diario")?.focus();
        }}
      >
        Ir para o conteúdo
      </a>
      <header className="shell-header">
        <div className="shell-mobile-brand"><Brand /></div>
        <span className="shell-status" role="status">
          <Icon name={busy ? "refresh" : online ? "wifi" : "offline"} size={16} />
          {busy ? "Atualizando…" : online ? "Online" : "Offline"}
        </span>
      </header>
      <nav className="shell-nav" aria-label="Navegação principal">
        <div className="shell-desktop-brand"><Brand /></div>
        {destinations.map(({ id, label, icon }) => (
          <Fragment key={id}>
            {id === "analytics" && create("mobile")}
            <button
              type="button"
              className="shell-link"
              aria-current={screen === id ? "page" : undefined}
              onClick={() => onNavigate(id)}
            >
              <span className="shell-link-icon"><Icon name={icon} /></span>
              <span>{label}</span>
            </button>
          </Fragment>
        ))}
        {create("desktop")}
      </nav>
      <main
        className="shell-content"
        id="diario"
        tabIndex={-1}
        aria-label={destinations.find(({ id }) => id === screen)?.label}
      >
        {children}
      </main>
    </div>
  );
}
