import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { message } from "./api";
import { Breakdown, CategoryDot } from "./Breakdown";
import {
  cents,
  localDate,
  money,
  movePeriod,
  periodBounds,
  periodRows,
  totals,
  type Draft,
  type Expense,
  type Period,
} from "./domain";
import { record } from "./microphone";
import { ThemeToggle } from "./ThemeToggle";
import { useDiary } from "./useDiary";
import {
  canStartShortcutRecording,
  consumeVoiceShortcut,
} from "./voiceShortcut";
import "./style.css";

const periodOptions = [
  { value: "day", label: "Diário", previous: "Dia anterior", next: "Próximo dia" },
  {
    value: "week",
    label: "Semanal",
    previous: "Semana anterior",
    next: "Próxima semana",
  },
  {
    value: "month",
    label: "Mensal",
    previous: "Mês anterior",
    next: "Próximo mês",
  },
  { value: "year", label: "Anual", previous: "Ano anterior", next: "Próximo ano" },
] as const;

function periodName(period: Period, date: string) {
  const { start, end } = periodBounds(period, date);
  if (period === "year") return String(start.getFullYear());
  if (period === "month")
    return start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  if (period === "week")
    return new Intl.DateTimeFormat("pt-BR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).formatRange(start, end);
  return start.toLocaleDateString("pt-BR", { dateStyle: "long" });
}

const dayName = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
type Diary = ReturnType<typeof useDiary>;
type OpenEditor = {
  expense: Expense | null;
  mode: "manual" | "voice" | "shortcut";
};

function Brand() {
  return (
    <div className="brand">
      <img src="/icon-192.png" alt="" width="32" height="32" />
      <span>Diário de gastos</span>
    </div>
  );
}

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

async function withMessage(
  fn: () => Promise<void>,
  report: (s: string) => void,
) {
  try {
    await fn();
  } catch (error) {
    report(message(error));
  }
}
function Recorder({
  diary,
  onDraft,
  focus,
  automatic,
}: {
  diary: Diary;
  onDraft: (draft: Draft) => void;
  focus: boolean;
  automatic: boolean;
}) {
  const [state, setState] = useState<
    "idle" | "starting" | "recording" | "sending"
  >("idle");
  const [error, setError] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<(() => Blob) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  useEffect(() => {
    let mounted = true;
    if (automatic)
      void canStartShortcutRecording().then(
        (allowed) => {
          if (
            allowed &&
            mounted &&
            !startedRef.current &&
            document.activeElement === buttonRef.current
          )
            void start(true);
        },
        () => {},
      );
    return () => {
      mounted = false;
      abortRef.current?.abort();
    };
  }, [automatic]);
  async function finish() {
    const stop = stopRef.current;
    const session = abortRef.current;
    if (!stop || session?.signal.aborted) return;
    stopRef.current = null;
    setState("sending");
    try {
      const body = new FormData();
      body.set("audio", stop(), "gasto.wav");
      body.set("date", localDate());
      const draft = await diary.mutate<Draft>("drafts", "POST", body);
      if (!session?.signal.aborted) onDraft(draft);
    } catch (err) {
      if (!session?.signal.aborted) setError(message(err));
    } finally {
      if (!session?.signal.aborted) {
        abortRef.current = null;
        setState("idle");
      }
    }
  }
  async function start(fromShortcut = false) {
    if (abortRef.current) return;
    startedRef.current = true;
    setError("");
    setState("starting");
    const session = new AbortController();
    abortRef.current = session;
    try {
      const stop = await record(
        () => {
          if (session.signal.aborted) return;
          if (!fromShortcut) {
            void finish();
            return;
          }
          cancel();
          setError(
            "A gravação foi encerrada. Toque em Gravar gasto para tentar novamente.",
          );
        },
        session.signal,
        fromShortcut,
      );
      if (!session.signal.aborted) {
        stopRef.current = stop;
        setState("recording");
      }
    } catch (err) {
      if (session.signal.aborted) return;
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permita o uso do microfone ou preencha o formulário."
          : message(err),
      );
      abortRef.current = null;
      setState("idle");
    }
  }
  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    stopRef.current = null;
    setState("idle");
  }
  const unavailable =
    state === "starting" ||
    state === "sending" ||
    (!diary.online && state === "idle");
  return (
    <div className={focus ? "voice voice-first" : "voice"}>
      <button
        type="button"
        ref={buttonRef}
        data-editor-focus={focus && diary.online ? "" : undefined}
        className={"secondary" + (state === "recording" ? " recording" : "")}
        aria-disabled={unavailable}
        onClick={() => {
          if (!unavailable) void (state === "recording" ? finish() : start());
        }}
      >
        {state === "idle"
          ? "Gravar gasto"
          : state === "starting"
            ? "Abrindo microfone…"
            : state === "recording"
              ? "Parar e interpretar"
              : "Interpretando…"}
      </button>
      {(state === "starting" || state === "recording") && (
        <button type="button" className="text" onClick={cancel}>
          Cancelar gravação
        </button>
      )}
      {state === "recording" && (
        <small role="status">Gravando · até 30 segundos</small>
      )}
      {!diary.online && (
        <small
          data-editor-focus={focus ? "" : undefined}
          tabIndex={focus ? -1 : undefined}
        >
          A gravação precisa de conexão.
        </small>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
function Editor({
  diary,
  expense,
  mode,
  done,
}: {
  diary: Diary;
  expense: OpenEditor["expense"];
  mode: OpenEditor["mode"];
  done: () => void;
}) {
  const [id] = useState(() => expense?.id || crypto.randomUUID());
  const [description, setDescription] = useState(expense?.description || "");
  const [price, setPrice] = useState(
    expense ? (expense.amount / 100).toFixed(2).replace(".", ",") : "",
  );
  const [date, setDate] = useState(expense?.date || localDate());
  const [category, setCategory] = useState(expense?.category || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = modal.current!;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-editor-focus]")?.focus();
    return () => {
      dialog.close();
    };
  }, []);
  function applyDraft(draft: Draft) {
    setDescription(draft.description || "");
    setPrice(
      draft.amount ? (draft.amount / 100).toFixed(2).replace(".", ",") : "",
    );
    setDate(draft.date || localDate());
    setCategory(draft.category || "");
    setError(
      draft.amount
        ? "Confira o rascunho antes de confirmar."
        : "Informe o valor e confira os demais campos.",
    );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const amount = cents(price);
    if (!amount || !category.trim() || !description.trim()) {
      setError("Informe um valor positivo, uma descrição e uma categoria.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await diary.mutate(
        expense ? "expenses/" + id : "expenses",
        expense ? "PUT" : "POST",
        JSON.stringify({
          id,
          description: description.trim(),
          amount,
          date,
          category: category.trim(),
        }),
      );
      done();
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  }
  const recorder = !expense && (
    <Recorder
      diary={diary}
      onDraft={applyDraft}
      focus={mode !== "manual"}
      automatic={mode === "shortcut"}
    />
  );
  return (
    <dialog
      ref={modal}
      aria-labelledby="editor-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) done();
      }}
    >
      <div className="heading">
        <h2 id="editor-title">{expense ? "Editar gasto" : "Novo gasto"}</h2>
        <button
          type="button"
          className="close"
          aria-label="Fechar"
          onClick={done}
          disabled={saving}
        >
          ×
        </button>
      </div>
      {mode !== "manual" && recorder}
      <form onSubmit={submit}>
        <div className="fields">
          <label>
            Valor (R$)
            <input
              value={price}
              data-editor-focus={mode === "manual" ? "" : undefined}
              placeholder="0,00"
              inputMode="decimal"
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </label>
          <label>
            Data
            <input
              type="date"
              value={date}
              required
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
        <label>
          Descrição
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={240}
          />
        </label>
        <label>
          Categoria
          <input
            list="cats"
            value={category}
            maxLength={80}
            onChange={(e) => setCategory(e.target.value)}
            required
          />
        </label>
        <datalist id="cats">
          {diary.data?.categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {diary.data?.categories.length ? (
          <div
            className="category-picks"
            role="group"
            aria-label="Categorias pessoais"
          >
            {diary.data.categories.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={category === name}
                onClick={() => setCategory(name)}
              >
                <CategoryDot category={name} /> {name}
              </button>
            ))}
          </div>
        ) : null}
        {category.trim() &&
          !diary.data?.categories.some(
            (c) =>
              c.toLocaleLowerCase("pt-BR") ===
              category.trim().toLocaleLowerCase("pt-BR"),
          ) && (
            <small>
              A categoria “{category.trim()}” será criada ao confirmar.
            </small>
          )}
        {error && <p role="status">{error}</p>}
        <button
          type="submit"
          className="primary"
          disabled={saving || diary.busy || !diary.online}
        >
          {saving
            ? "Salvando…"
            : expense
              ? "Salvar alterações"
              : "Confirmar gasto"}
        </button>
      </form>
      {mode === "manual" && recorder}
    </dialog>
  );
}

function Book({ diary }: { diary: Diary }) {
  const [period, setPeriod] = useState<Period>("month");
  const [date, setDate] = useState(localDate);
  const [category, setCategory] = useState<string | null>(null);
  const [editor, setEditor] = useState<OpenEditor | null>(null);
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const { busy, data, online } = diary;
  const rows = periodRows(data?.expenses || [], period, date);
  const groups = totals(rows);
  const total = groups.reduce((sum, [, value]) => sum + value, 0);
  const visibleRows = category
    ? rows.filter((row) => row.category === category)
    : rows;
  const currentPeriod = periodOptions.find(({ value }) => value === period)!;
  const periodLabel = periodName(period, date);

  useEffect(() => {
    if (!busy && consumeVoiceShortcut())
      setEditor({ expense: null, mode: online ? "shortcut" : "voice" });
  }, [busy, online]);

  function openEditor(mode: "manual" | "voice") {
    setNotice("");
    setEditor({ expense: null, mode });
  }

  return (
    <>
      <header>
        <div className="wrap top">
          <Brand />
          <div className="account-actions">
            {!busy && (
              <span className="connection">{online ? "Online" : "Offline"}</span>
            )}
            <ThemeToggle />
            <button className="text" onClick={() => void diary.logout()}>
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="wrap board">
        <div className="page-heading">
          <h1>Meus gastos</h1>
          <div
            className="quick-actions"
            role="group"
            aria-label="Ações do diário"
          >
            <a className="history-jump" href="#historico">
              Histórico
            </a>
            <button
              className="primary new-expense"
              disabled={!online || busy}
              onClick={() => openEditor("manual")}
            >
              <span aria-hidden="true">+</span> Novo gasto
            </button>
            <button
              className="secondary voice-action"
              aria-label="Registrar por voz"
              disabled={!online || busy}
              onClick={() => openEditor("voice")}
            >
              <span className="mic-icon" aria-hidden="true" />
              <span>Voz</span>
            </button>
          </div>
        </div>
        {diary.notice && (
          <p role="status" className="notice">
            {diary.notice}
          </p>
        )}
        <div className="layout">
          <section className="summary" aria-label="Resumo do período">
            <div
              className="segments period-options"
              role="group"
              aria-label="Período"
            >
              {periodOptions.map(({ value, label }) => (
                <button
                  key={value}
                  aria-pressed={period === value}
                  onClick={() => setPeriod(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="period-navigation">
              <button
                className="period-step"
                aria-label={currentPeriod.previous}
                onClick={() => setDate((day) => movePeriod(period, day, -1))}
              >
                ‹
              </button>
              {period === "month" ? (
                <label className="current-period month-picker">
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
                        setDate(month + "-01");
                    }}
                  />
                </label>
              ) : (
                <span className="current-period" aria-live="polite">
                  {periodLabel}
                </span>
              )}
              <button
                className="period-step"
                aria-label={currentPeriod.next}
                onClick={() => setDate((day) => movePeriod(period, day, 1))}
              >
                ›
              </button>
            </div>
            <p>Total no período</p>
            <strong>{data ? money(total) : "—"}</strong>
            <span className="period-count">
              {data ? rows.length : "—"} {rows.length === 1 ? "gasto" : "gastos"}
            </span>
          </section>
          <Breakdown
            groups={groups}
            total={total}
            selected={category}
            onSelect={setCategory}
            ready={Boolean(data)}
          />
          <section
            id="historico"
            className="history"
            aria-labelledby="history-title"
          >
            <div className="heading">
              <h2 id="history-title">Histórico</h2>
              <span aria-live="polite">
                {data ? visibleRows.length : "—"}{" "}
                {visibleRows.length === 1 ? "gasto" : "gastos"}
              </span>
            </div>
            {category && (
              <div className="history-filter">
                <span>
                  <CategoryDot category={category} /> {category}
                </span>
                <button className="text" onClick={() => setCategory(null)}>
                  Limpar filtro
                </button>
              </div>
            )}
            {notice && <p role="status">{notice}</p>}
            {!data ? (
              <p className="empty">
                {busy
                  ? "Consultando gastos…"
                  : "Nenhuma cópia do histórico disponível."}
              </p>
            ) : visibleRows.length === 0 ? (
              <p className="empty">
                {category
                  ? "Nenhum gasto nesta categoria no período."
                  : `Nenhum gasto em ${periodLabel}.`}
              </p>
            ) : (
              <ul className="expense-list">
                {visibleRows.map((row) => (
                  <li key={row.id}>
                    <div className="row">
                      <div className="expense-main">
                        <h3>{row.description}</h3>
                        <small>
                          <span className="expense-category">
                            <CategoryDot category={row.category} />
                            {row.category}
                          </span>
                          <span className="expense-date">{dayName(row.date)}</span>
                        </small>
                      </div>
                      <strong>{money(row.amount)}</strong>
                    </div>
                    {online && (
                      <div className="actions">
                        {deleting === row.id ? (
                          <>
                            <span>Excluir este gasto?</span>
                            <button
                              className="danger"
                              disabled={busy}
                              onClick={() =>
                                void withMessage(async () => {
                                  await diary.mutate(
                                    "expenses/" + row.id,
                                    "DELETE",
                                  );
                                  setDeleting(null);
                                  setNotice("Gasto excluído.");
                                }, setNotice)
                              }
                            >
                              Sim, excluir
                            </button>
                            <button onClick={() => setDeleting(null)}>
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              disabled={busy}
                              onClick={() =>
                                setEditor({ expense: row, mode: "manual" })
                              }
                            >
                              Editar
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => setDeleting(row.id)}
                            >
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <footer>
              <small>
                {data
                  ? "Última sincronização · " +
                    new Date(data.syncedAt).toLocaleString("pt-BR")
                  : "Histórico ainda não sincronizado"}
              </small>
              <button
                className="text"
                onClick={() => void diary.refresh()}
                disabled={busy}
              >
                Atualizar
              </button>
            </footer>
          </section>
        </div>
      </main>
      {editor && (
        <Editor
          diary={diary}
          expense={editor.expense}
          mode={editor.mode}
          done={() => setEditor(null)}
        />
      )}
    </>
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
