import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { message } from "./api";
import { CategoryDot } from "./Breakdown";
import { cents, localDate, type Draft, type Expense } from "./domain";
import { Icon } from "./Icon";
import type { useDiary } from "./useDiary";
import { VoiceRecorder } from "./VoiceRecorder";
import "./editor.css";

type Mode = "manual" | "voice";

function inputPrice(amount: number | null | undefined) {
  return amount ? (amount / 100).toFixed(2).replace(".", ",") : "";
}

export function ExpenseEditor({
  diary,
  expense,
  mode,
  done,
}: {
  diary: ReturnType<typeof useDiary>;
  expense: Expense | null;
  mode: Mode;
  done: (saved?: boolean) => void;
}) {
  const [id] = useState(() => expense?.id || crypto.randomUUID());
  const [view, setView] = useState<Mode>(mode);
  const [description, setDescription] = useState(expense?.description || "");
  const [price, setPrice] = useState(inputPrice(expense?.amount));
  const [date, setDate] = useState(expense?.date || localDate());
  const [category, setCategory] = useState(expense?.category || "");
  const [draftReady, setDraftReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const amount = cents(price);
  const cleanCategory = category.trim();
  const categories = diary.data?.categories ?? [];
  const categoryName = cleanCategory.toLocaleLowerCase("pt-BR");
  const newCategory = cleanCategory && !categories.some(
    (name) => name.toLocaleLowerCase("pt-BR") === categoryName,
  );
  const fields = {
    price: amount ? "" : "Informe um valor positivo, com até duas casas decimais.",
    date: date ? "" : "Selecione a data do gasto.",
    description: description.trim() ? "" : "Informe uma descrição.",
    category: cleanCategory ? "" : "Informe uma categoria.",
  };
  const issues = Object.entries(fields).filter(([, issue]) => issue);
  const invalid = (field: keyof typeof fields) => Boolean(attempt && fields[field]);
  const hint = (field: keyof typeof fields) => invalid(field) ? (
    <small className="editor-field-error" id={`editor-${field}-error`}>
      {fields[field]}
    </small>
  ) : null;

  useLayoutEffect(() => {
    const dialog = modal.current!;
    const trigger = document.activeElement;
    dialog.showModal();
    const viewport = window.visualViewport;
    function fitViewport() {
      if (!viewport || viewport.scale !== 1) {
        dialog.style.removeProperty("--editor-viewport");
        dialog.style.removeProperty("--editor-inset");
        return;
      }
      dialog.style.setProperty("--editor-viewport", `${viewport.height}px`);
      dialog.style.setProperty(
        "--editor-inset",
        `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`,
      );
    }
    viewport?.addEventListener("resize", fitViewport);
    viewport?.addEventListener("scroll", fitViewport);
    fitViewport();
    return () => {
      viewport?.removeEventListener("resize", fitViewport);
      viewport?.removeEventListener("scroll", fitViewport);
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  useLayoutEffect(() => {
    const dialog = modal.current!;
    dialog.scrollTop = 0;
    dialog.querySelector<HTMLElement>("[data-editor-focus]")?.focus({ preventScroll: true });
  }, [view, draftReady]);

  useLayoutEffect(() => {
    if (!attempt) return;
    (summary.current ?? modal.current?.querySelector<HTMLElement>("[aria-invalid=true]"))?.focus();
  }, [attempt]);

  function show(next: Mode) {
    setAttempt(0);
    setError("");
    setView(next);
  }

  function applyDraft(draft: Draft) {
    setDescription(draft.description || "");
    setPrice(inputPrice(draft.amount));
    setDate(draft.date || localDate());
    setCategory(draft.category || "");
    setDraftReady(true);
    show("manual");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || diary.busy || !diary.online) return;
    setError("");
    if (issues.length) {
      setAttempt((previous) => previous + 1);
      return;
    }
    setSaving(true);
    try {
      await diary.mutate(
        expense ? "expenses/" + id : "expenses",
        expense ? "PUT" : "POST",
        JSON.stringify({
          id,
          description: description.trim(),
          amount,
          date,
          category: cleanCategory,
        }),
      );
      done(true);
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      className="expense-editor"
      ref={modal}
      aria-labelledby="editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) done();
      }}
    >
      <div className="editor-heading">
        <div>
          <h2
            id="editor-title"
            tabIndex={-1}
            data-editor-focus={
              (view === "manual" && draftReady) || (view === "voice" && !diary.online)
                ? "" : undefined
            }
          >
            {expense ? "Editar gasto" : view === "voice" ? "Registro por voz" :
              draftReady ? "Revisar rascunho" : "Novo gasto"}
          </h2>
          {view === "voice" && <p>Diga o valor, o que comprou e a categoria.</p>}
        </div>
        <button
          type="button"
          className="text editor-close"
          aria-label="Fechar"
          onClick={() => done()}
          disabled={saving}
        >
          <Icon name="close" />
        </button>
      </div>

      {view === "voice" ? (
        <VoiceRecorder diary={diary} onDraft={applyDraft} onManual={() => show("manual")} />
      ) : (
        <form className="editor-form" onSubmit={submit} noValidate aria-busy={saving}>
          {draftReady && (
            <div className="editor-draft">
              <Icon name="sparkles" />
              <span>
                <strong>Rascunho gerado por IA</strong>
                {price ? "Confira e ajuste os campos antes de confirmar." :
                  "Informe o valor e confira os demais campos."}
              </span>
            </div>
          )}
          {attempt > 0 && issues.length > 1 && (
            <div className="editor-alert" ref={summary} role="alert" tabIndex={-1}>
              <strong>Confira os campos abaixo.</strong>
              <ul>
                {issues.map(([field, issue]) => (
                  <li key={field}>
                    <a href={`#editor-${field}`} onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(`editor-${field}`)?.focus();
                    }}>{issue}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="editor-fields">
            <div className="editor-field">
              <label htmlFor="editor-price">Valor (R$)</label>
              <input
                id="editor-price"
                value={price}
                data-editor-focus={draftReady ? undefined : ""}
                placeholder="0,00"
                inputMode="decimal"
                onChange={(event) => setPrice(event.target.value)}
                aria-invalid={invalid("price")}
                aria-describedby={invalid("price") ? "editor-price-error" : undefined}
                required
              />
              {hint("price")}
            </div>
            <div className="editor-field">
              <label htmlFor="editor-date">Data</label>
              <input
                id="editor-date"
                type="date"
                value={date}
                required
                onChange={(event) => setDate(event.target.value)}
                aria-invalid={invalid("date")}
                aria-describedby={invalid("date") ? "editor-date-error" : undefined}
              />
              {hint("date")}
            </div>
          </div>
          <div className="editor-field">
            <label htmlFor="editor-description">Descrição</label>
            <input
              id="editor-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              maxLength={240}
              aria-invalid={invalid("description")}
              aria-describedby={invalid("description") ? "editor-description-error" : undefined}
            />
            {hint("description")}
          </div>
          <div className="editor-field">
            <label htmlFor="editor-category">Categoria</label>
            <input
              id="editor-category"
              list="editor-categories"
              value={category}
              maxLength={80}
              onChange={(event) => setCategory(event.target.value)}
              required
              aria-invalid={invalid("category")}
              aria-describedby={invalid("category") ? "editor-category-error" :
                newCategory ? "editor-new-category" : undefined}
            />
            {hint("category")}
          </div>
          <datalist id="editor-categories">
            {categories.map((name) => <option key={name} value={name} />)}
          </datalist>
          {categories.length > 0 && (
            <div className="editor-categories" role="group" aria-label="Categorias pessoais">
              {categories.map((name) => (
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
          )}
          {newCategory && (
            <small className="editor-category-hint" id="editor-new-category">
              A categoria “{cleanCategory}” será criada ao confirmar.
            </small>
          )}
          {!diary.online && <p className="editor-alert" role="status">Reconecte para salvar o gasto.</p>}
          {error && <p className="editor-alert" role="alert">{error}</p>}
          <div className="editor-actions">
            <button
              type="submit"
              className="primary"
              disabled={saving || diary.busy || !diary.online}
            >
              {saving ? "Salvando…" : expense ? "Salvar alterações" : "Confirmar gasto"}
              {!saving && <Icon name="check" />}
            </button>
            {draftReady ? (
              <button type="button" className="text" disabled={saving} onClick={() => done()}>
                Descartar rascunho
              </button>
            ) : !expense && (
              <button
                type="button"
                className="text editor-mode"
                disabled={saving || diary.busy || !diary.online}
                onClick={() => show("voice")}
              >
                <Icon name="mic" /> Registrar por voz
              </button>
            )}
          </div>
        </form>
      )}
    </dialog>
  );
}
