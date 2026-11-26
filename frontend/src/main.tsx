import { createRoot } from "react-dom/client";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { message } from "./api";
import { AppShell, Brand, type Screen } from "./AppShell";
import { Breakdown } from "./Breakdown";
import { localDate, periodRows, totals, type Expense, type Period } from "./domain";
import { ExpenseEditor } from "./ExpenseEditor";
import { ExpenseHistory } from "./ExpenseHistory";
import { Icon } from "./Icon";
import { Overview, PeriodControls, periodName } from "./Overview";
import { ThemeToggle } from "./ThemeToggle";
import { useDiary } from "./useDiary";
import { consumeVoiceShortcut } from "./voiceShortcut";
import "./style.css";

type Diary = ReturnType<typeof useDiary>;
type OpenEditor = { expense: Expense | null; mode: "manual" | "voice" };

function Login({ diary }: { diary: Diary }) {
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const inputs = new FormData(e.currentTarget);
    try {
      await diary.login(
        String(inputs.get("email")),
        String(inputs.get("password")),
      );
    } catch (err) {
      setError(message(err));
    }
  }
  return (
    <main className="login">
      <div className="login-panel">
        <div className="heading">
          <Brand />
          <ThemeToggle />
        </div>
        <h1>Entrar</h1>
        <form onSubmit={submit}>
          <label>
            E-mail
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              autoCapitalize="none"
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="primary" disabled={diary.busy}>
            Acessar meu diário
          </button>
        </form>
        {(error || diary.notice) && (
          <p role="status">{error || diary.notice}</p>
        )}
        {!diary.online && !diary.busy && (
          <button className="text" onClick={() => void diary.refresh()}>
            Verificar conexão
          </button>
        )}
      </div>
    </main>
  );
}

const screenHash = {
  home: "",
  history: "#historico",
  analytics: "#analises",
  settings: "#ajustes",
} as const;

const screenTitle = {
  home: "Meus gastos",
  history: "Histórico",
  analytics: "Análises",
  settings: "Ajustes",
} as const;

function currentScreen(): Screen {
  const screens = Object.keys(screenHash) as Screen[];
  return screens.find((screen) => screenHash[screen] === location.hash) ?? "home";
}

function ExpenseChoices({
  choose,
  close,
  available,
}: {
  choose: (mode: OpenEditor["mode"]) => void;
  close: () => void;
  available: boolean;
}) {
  const modal = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = modal.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={modal}
      className="choice-sheet"
      aria-labelledby="choice-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="heading">
        <h2 id="choice-title">Novo gasto</h2>
        <button type="button" className="text icon-control" aria-label="Fechar" onClick={close}>
          <Icon name="close" />
        </button>
      </div>
      <button type="button" className="choice-option" onClick={() => choose("manual")} disabled={!available} autoFocus>
        <span className="choice-icon"><Icon name="keyboard" /></span>
        <span>Preencher manualmente</span>
        <Icon name="chevronRight" />
      </button>
      <button type="button" className="choice-option" onClick={() => choose("voice")} disabled={!available}>
        <span className="choice-icon voice-choice"><Icon name="mic" /></span>
        <span>Registrar por voz</span>
        <Icon name="chevronRight" />
      </button>
    </dialog>
  );
}

function Book({ diary }: { diary: Diary }) {
  const [screen, setScreen] = useState(currentScreen);
  const [period, setPeriod] = useState<Period>("month");
  const [date, setDate] = useState(localDate);
  const [homeCategory, setHomeCategory] = useState<string | null>(null);
  const [historyCategory, setHistoryCategory] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [editor, setEditor] = useState<OpenEditor | null>(null);
  const [notice, setNotice] = useState("");
  const restoreTo = useRef<HTMLElement | null>(null);
  const moveFocus = useRef(false);
  const { busy, data, online } = diary;

  useEffect(() => {
    if (!busy && consumeVoiceShortcut())
      setEditor({ expense: null, mode: "voice" });
  }, [busy]);

  useEffect(() => {
    function onHashChange() {
      const next = currentScreen();
      if (next === screen) return;
      moveFocus.current = true;
      setScreen(next);
    }
    addEventListener("hashchange", onHashChange);
    return () => removeEventListener("hashchange", onHashChange);
  }, [screen]);

  useLayoutEffect(() => {
    if (moveFocus.current) {
      moveFocus.current = false;
      document.getElementById("diario")?.focus({ preventScroll: true });
      scrollTo(0, 0);
    }
  }, [screen]);

  useLayoutEffect(() => {
    if (choosing || editor || !restoreTo.current) return;
    if (restoreTo.current.isConnected && !restoreTo.current.matches(":disabled"))
      restoreTo.current.focus({ preventScroll: true });
    else document.getElementById("diario")?.focus({ preventScroll: true });
    restoreTo.current = null;
  }, [choosing, editor]);

  function navigate(next: Screen) {
    if (next === screen) return;
    moveFocus.current = true;
    history.pushState(null, "", screenHash[next] || location.pathname + location.search);
    setScreen(next);
  }

  function openEditor(mode: OpenEditor["mode"], expense: Expense | null = null) {
    if (!choosing) restoreTo.current = document.activeElement as HTMLElement | null;
    setChoosing(false);
    setNotice("");
    setEditor({ expense, mode });
  }

  function changePeriod(nextPeriod: Period, nextDate: string) {
    if (period === nextPeriod && date === nextDate) return;
    setPeriod(nextPeriod);
    setDate(nextDate);
    setHomeCategory(null);
    setHistoryCategory(null);
  }

  function openHistory(category: string | null) {
    setHistoryCategory(category);
    navigate("history");
  }

  const expenses = data?.expenses || [];
  const rows = periodRows(expenses, period, date);
  const groups = totals(rows);
  const total = groups.reduce((sum, [, value]) => sum + value, 0);
  const ready = Boolean(data);
  const controls = {
    period,
    date,
    onPeriod: (next: Period) => changePeriod(next, date),
    onDate: (next: string) => changePeriod(period, next),
  };
  const overview = (
    <Overview {...controls} expenses={expenses} rows={rows} total={total} ready={ready} busy={busy} />
  );
  function expenseHistory(recent = false) {
    const category = recent ? homeCategory : historyCategory;
    return (
      <ExpenseHistory
        rows={category ? rows.filter((row) => row.category === category) : rows}
        ready={ready}
        busy={busy}
        online={online}
        category={category}
        onClear={() => (recent ? setHomeCategory : setHistoryCategory)(null)}
        onEdit={(expense) => openEditor("manual", expense)}
        onDelete={async (id) => { await diary.mutate("expenses/" + id, "DELETE"); }}
        periodLabel={periodName(period, date)}
        recent={recent}
        onHistory={() => openHistory(homeCategory)}
      />
    );
  }

  return (
    <>
      <AppShell
        screen={screen}
        onNavigate={navigate}
        onNew={() => {
          restoreTo.current = document.activeElement as HTMLElement | null;
          setChoosing(true);
        }}
        online={online}
        busy={busy}
      >
        <div className="screen-content" key={screen}>
          <div className="page-heading"><h1>{screenTitle[screen]}</h1></div>
          {diary.notice && <p role="status" className="notice">{diary.notice}</p>}
          <div role="status" className={notice ? "success-banner" : undefined}>
            {notice && <><Icon name="check" />{notice}</>}
          </div>
          {screen === "home" && (
            <>
              <div className="dashboard-grid home-dashboard">
                {overview}
                <section className="voice-card" aria-labelledby="voice-card-title">
                  <div className="voice-card-copy">
                    <h2 id="voice-card-title">Registre por voz</h2>
                    <p>Dite o gasto e revise o rascunho preparado pela IA.</p>
                    <button className="primary" type="button" disabled={!online || busy} onClick={() => openEditor("voice")}>
                      <Icon name="mic" /> Registrar por voz
                    </button>
                  </div>
                  <div className="voice-card-orb" aria-hidden="true">
                    <Icon name="mic" size={37} />
                  </div>
                </section>
                <Breakdown
                  groups={groups}
                  total={total}
                  selected={homeCategory}
                  onSelect={(category) => setHomeCategory(homeCategory === category ? null : category)}
                  ready={ready}
                />
                {expenseHistory(true)}
              </div>
              <SyncStatus diary={diary} />
            </>
          )}
          {screen === "history" && (
            <>
              <div className="period-panel"><PeriodControls {...controls} /></div>
              {expenseHistory()}
              <SyncStatus diary={diary} />
            </>
          )}
          {screen === "analytics" && (
            <div className="dashboard-grid">
              {overview}
              <Breakdown groups={groups} total={total} onSelect={openHistory} ready={ready} />
            </div>
          )}
          {screen === "settings" && (
            <div className="settings-card">
              <section aria-labelledby="appearance-title">
                <div>
                  <h2 id="appearance-title">Aparência</h2>
                  <p>Escolha o tema deste aparelho.</p>
                </div>
                <ThemeToggle />
              </section>
              <section aria-labelledby="session-title">
                <div>
                  <h2 id="session-title">Sessão</h2>
                  <p>Sair também remove a cópia offline deste aparelho.</p>
                </div>
                <button className="text sign-out" type="button" onClick={() => {
                  history.replaceState(null, "", location.pathname + location.search);
                  void diary.logout();
                }}>
                  <Icon name="logout" /> Sair
                </button>
              </section>
            </div>
          )}
        </div>
      </AppShell>
      {choosing && <ExpenseChoices choose={openEditor} close={() => setChoosing(false)} available={online && !busy} />}
      {editor && (
        <ExpenseEditor
          diary={diary}
          expense={editor.expense}
          mode={editor.mode}
          done={(saved) => {
            if (saved) setNotice(editor.expense ? "Alterações salvas." : "Gasto confirmado.");
            setEditor(null);
          }}
        />
      )}
    </>
  );
}

function SyncStatus({ diary }: { diary: Diary }) {
  return (
    <footer className="sync-status">
      <span>{diary.data
        ? "Última sincronização · " + new Date(diary.data.syncedAt).toLocaleString("pt-BR")
        : "Histórico ainda não sincronizado"}</span>
      <button className="text" type="button" disabled={diary.busy} onClick={() => void diary.refresh()}>
        <Icon name="refresh" size={16} /> Atualizar
      </button>
    </footer>
  );
}

function App() {
  const diary = useDiary();
  return diary.marker && !diary.marker.pending ? (
    <Book key={diary.marker.epoch} diary={diary} />
  ) : (
    <Login diary={diary} />
  );
}
createRoot(document.getElementById("root")!).render(<App />);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  void navigator.serviceWorker.register("/sw.js").catch(() => {
    /* Online access remains available. */
  });
