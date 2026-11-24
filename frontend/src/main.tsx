import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { message } from "./api";
import {
  cents,
  localDate,
  money,
  monthRows,
  totals,
  type Draft,
  type Expense,
} from "./domain";
import { record } from "./microphone";
import { useDiary } from "./useDiary";
import "./style.css";

const monthName = (month: string) =>
  new Date(month + "-15T12:00:00").toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
const dayName = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
type Diary = ReturnType<typeof useDiary>;

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
        <Brand />
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
            Acessar meu diário <span aria-hidden="true">→</span>
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
}: {
  diary: Diary;
  onDraft: (draft: Draft) => void;
}) {
  const [state, setState] = useState<
    "idle" | "starting" | "recording" | "sending"
  >("idle");
  const [error, setError] = useState("");
  const stopRef = useRef<(() => Blob) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );
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
      if (!session?.signal.aborted) setState("idle");
    }
  }
  async function start() {
    setError("");
    setState("starting");
    const session = new AbortController();
    abortRef.current = session;
    try {
      stopRef.current = await record(() => void finish(), session.signal);
      if (!session.signal.aborted) setState("recording");
    } catch (err) {
      if (session.signal.aborted) return;
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permita o uso do microfone ou digite os campos abaixo."
          : message(err),
      );
      setState("idle");
    }
  }
  function cancel() {
    abortRef.current?.abort();
    stopRef.current = null;
    setState("idle");
  }
  return (
    <div className="voice">
      <button
        type="button"
        className={"secondary" + (state === "recording" ? " recording" : "")}
        disabled={
          state === "starting" ||
          state === "sending" ||
          (!diary.online && state === "idle")
        }
        onClick={() => void (state === "recording" ? finish() : start())}
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
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
function Editor({
  diary,
  expense,
  done,
}: {
  diary: Diary;
  expense: Expense | null;
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
      {!expense && <Recorder diary={diary} onDraft={applyDraft} />}
      <form onSubmit={submit}>
        <label>
          Descrição
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={240}
          />
        </label>
        <div className="fields">
          <label>
            Valor (R$)
            <input
              value={price}
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
    </dialog>
  );
}

function Book({ diary }: { diary: Diary }) {
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [editor, setEditor] = useState<Expense | null | undefined>(undefined);
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const data = diary.data;
  const rows = monthRows(data?.expenses || [], month);
  const groups = totals(rows);
  const total = groups.reduce((sum, [, value]) => sum + value, 0);
  function moveMonth(step: number) {
    const first = new Date(month + "-15T12:00:00");
    first.setMonth(first.getMonth() + step);
    setMonth(localDate(first).slice(0, 7));
  }
  return (
    <>
      <header>
        <div className="wrap top">
          <Brand />
          <button className="text" onClick={() => void diary.logout()}>
            Sair
          </button>
        </div>
      </header>
      <main className="wrap board">
        <div className="heading">
          <h1>Meus gastos</h1>
          <button
            className="primary"
            disabled={!diary.online || diary.busy}
            onClick={() => {
              setNotice("");
              setEditor(null);
            }}
          >
            + Novo gasto
          </button>
        </div>
        {diary.notice && (
          <p role="status" className="notice">
            {diary.notice}
          </p>
        )}
        <div className="layout">
          <section aria-label="Resumo mensal" className="summary">
            <div className="month">
              <button
                className="arrow"
                aria-label="Mês anterior"
                onClick={() => moveMonth(-1)}
              >
                ‹
              </button>
              <label>
                {monthName(month)}
                <input
                  type="month"
                  value={month}
                  aria-label="Selecionar mês"
                  onChange={(e) => {
                    if (e.target.value) setMonth(e.target.value);
                  }}
                />
              </label>
              <button
                className="arrow"
                aria-label="Próximo mês"
                onClick={() => moveMonth(1)}
              >
                ›
              </button>
            </div>
            <p>Total do mês</p>
            <strong>{data ? money(total) : "—"}</strong>
            <h2>Por categoria</h2>
            {groups.length ? (
              <ul>
                {groups.map(([c, v]) => (
                  <li key={c}>
                    <div>
                      <span>{c}</span>
                      <b>{money(v)}</b>
                    </div>
                    <progress
                      aria-label={"Participação de " + c}
                      value={v}
                      max={total}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <small>
                {data ? "Sem gastos neste mês." : "Aguardando histórico."}
              </small>
            )}
          </section>
          <section className="history">
            <div className="heading">
              <h2>Histórico</h2>
              <span>
                {data ? rows.length : "—"}{" "}
                {rows.length === 1 ? "gasto" : "gastos"}
              </span>
            </div>
            {notice && <p role="status">{notice}</p>}
            {!data ? (
              <p>
                {diary.busy
                  ? "Consultando gastos…"
                  : "Nenhuma cópia do histórico disponível."}
              </p>
            ) : rows.length === 0 ? (
              <p className="empty">Nenhum gasto em {monthName(month)}.</p>
            ) : (
              <ul>
                {rows.map((row) => (
                  <li key={row.id}>
                    <div className="row">
                      <div>
                        <small>
                          {dayName(row.date)} · {row.category}
                        </small>
                        <h3>{row.description}</h3>
                      </div>
                      <strong>{money(row.amount)}</strong>
                    </div>
                    {diary.online && (
                      <div className="actions">
                        {deleting === row.id ? (
                          <>
                            Excluir este gasto?
                            <button
                              disabled={diary.busy}
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
                              disabled={diary.busy}
                              onClick={() => setEditor(row)}
                            >
                              Editar
                            </button>
                            <button
                              disabled={diary.busy}
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
                disabled={diary.busy}
              >
                Atualizar
              </button>
            </footer>
          </section>
        </div>
      </main>
      {editor !== undefined && (
        <Editor
          diary={diary}
          expense={editor}
          done={() => setEditor(undefined)}
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
