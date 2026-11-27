import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { HttpError, message } from "./api";
import { CategoryDot } from "./Breakdown";
import { cents, localDate, money, type Draft, type Expense } from "./domain";
import { Icon } from "./Icon";
import type { useDiary } from "./useDiary";
import { VoiceRecorder } from "./VoiceRecorder";
import "./editor.css";

type Mode = "manual" | "voice";
type EditorFields = {
  description: string;
  price: string;
  date: string;
  category: string;
};

function inputPrice(amount: number | null | undefined) {
  return amount ? (amount / 100).toFixed(2).replace(".", ",") : "";
}

function displayPrice(price: string) {
  const amount = cents(price);
  return amount === null ? price.trim() : money(amount);
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
  done: (savedDate?: string) => void;
}) {
  const [id] = useState(() => expense?.id || crypto.randomUUID());
  const [view, setView] = useState<Mode>(mode);
  const [initialDate] = useState(() => expense?.date || localDate());
  const [description, setDescription] = useState(expense?.description || "");
  const [price, setPrice] = useState(inputPrice(expense?.amount));
  const [date, setDate] = useState(initialDate);
  const [category, setCategory] = useState(expense?.category || "");
  const [appliedDraft, setAppliedDraft] = useState<EditorFields | null>(null);
  const [draftToReview, setDraftToReview] = useState<EditorFields | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const confirmationTitle = useRef<HTMLHeadingElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const saveError = useRef<HTMLParagraphElement>(null);
  const amount = cents(price);
  const cleanCategory = category.trim();
  const original = appliedDraft ?? {
    description: expense?.description ?? "",
    price: inputPrice(expense?.amount),
    date: initialDate,
    category: expense?.category ?? "",
  };
  const changed =
    description.trim() !== original.description.trim() ||
    (amount === null ? price.trim() !== original.price : amount !== cents(original.price)) ||
    date !== original.date ||
    cleanCategory !== original.category.trim();
  const draftReady = appliedDraft !== null;
  const decision = confirmClose ? "close" : draftToReview ? "replace" : null;
  const comparison = draftToReview && [
    ["Valor", displayPrice(price), displayPrice(draftToReview.price)],
    ["Data", date.split("-").reverse().join("/"), draftToReview.date.split("-").reverse().join("/")],
    ["Descrição", description.trim(), draftToReview.description.trim()],
    ["Categoria", cleanCategory, draftToReview.category.trim()],
  ];
  const categories = diary.data?.categories ?? [];
  const categoryName = cleanCategory.toLocaleLowerCase("pt-BR");
  const newCategory = cleanCategory && !categories.some(
    (name) => name.toLocaleLowerCase("pt-BR") === categoryName,
  );
  const fields = {
    price: amount ? "" : "Informe um valor positivo com até duas casas decimais, como 1.234,56.",
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
    const confirmationDialog = confirmation.current!;
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
      confirmationDialog.close();
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  useLayoutEffect(() => {
    const dialog = confirmation.current!;
    if (decision) {
      if (!dialog.open) dialog.showModal();
      if (decision === "replace") {
        dialog.scrollTop = 0;
        confirmationTitle.current?.focus({ preventScroll: true });
      } else {
        keepEditing.current?.focus();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [decision]);

  useLayoutEffect(() => {
    const dialog = modal.current!;
    dialog.scrollTop = 0;
    dialog.querySelector<HTMLElement>("[data-editor-focus]")?.focus({ preventScroll: true });
  }, [view, draftReady]);

  useLayoutEffect(() => {
    if (!attempt) return;
    (summary.current ?? modal.current?.querySelector<HTMLElement>("[aria-invalid=true]"))?.focus();
  }, [attempt]);

  useLayoutEffect(() => {
    if (!error || saving) return;
    const button = saveButton.current;
    (button && !button.disabled ? button : saveError.current)?.focus();
  }, [error, saving]);

  function show(next: Mode) {
    setAttempt(0);
    setError("");
    setView(next);
  }

  function applyDraft(draft: EditorFields) {
    setDraftToReview(null);
    setDescription(draft.description);
    setPrice(draft.price);
    setDate(draft.date);
    setCategory(draft.category);
    setAppliedDraft(draft);
    show("manual");
  }

  function reviewDraft(draft: Draft) {
    const proposed = {
      description: draft.description || "",
      price: inputPrice(draft.amount),
      date: draft.date || localDate(),
      category: draft.category || "",
    };
    if (changed) setDraftToReview(proposed);
    else applyDraft(proposed);
  }

  function requestClose() {
    if (saving) return;
    if (changed || draftReady) setConfirmClose(true);
    else done();
  }

  function dismissConfirmation() {
    if (confirmClose) {
      setConfirmClose(false);
    } else {
      setDraftToReview(null);
      show("manual");
    }
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
      done(date);
    } catch (err) {
      setError(err instanceof HttpError && err.status === 503
        ? "Falha temporária ao salvar o gasto. Os campos foram mantidos. Tente novamente."
        : message(err));
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
        requestClose();
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
          onClick={requestClose}
          disabled={saving}
        >
          <Icon name="close" />
        </button>
      </div>

      {view === "voice" ? (
        <VoiceRecorder diary={diary} onDraft={reviewDraft} onManual={() => show("manual")} />
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
          {error && <p className="editor-alert" role="alert" ref={saveError} tabIndex={-1}>{error}</p>}
          <div className="editor-actions">
            <button
              type="submit"
              ref={saveButton}
              className="primary"
              disabled={saving || diary.busy || !diary.online}
            >
              {saving ? "Salvando…" : expense ? "Salvar alterações" : "Confirmar gasto"}
              {!saving && <Icon name="check" />}
            </button>
            {draftReady ? (
              <button
                type="button"
                className="text"
                disabled={saving}
                onClick={() => changed ? requestClose() : done()}
              >
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
      <dialog
        className="editor-confirmation"
        ref={confirmation}
        aria-labelledby="editor-confirmation-title"
        aria-describedby="editor-confirmation-description"
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dismissConfirmation();
        }}
      >
        <h2 id="editor-confirmation-title" ref={confirmationTitle} tabIndex={-1}>
          {confirmClose
            ? draftReady ? "Descartar rascunho?" : "Descartar preenchimento?"
            : "Usar o rascunho da gravação?"}
        </h2>
        <p id="editor-confirmation-description">
          {confirmClose
            ? "O que está neste formulário será descartado."
            : "Ao usar o rascunho, estes serão os novos valores do formulário."}
        </p>
        {!confirmClose && comparison && (
          <table className="editor-comparison" aria-label="Comparação dos campos">
            <thead>
              <tr>
                <th scope="col">Campo</th>
                <th scope="col" aria-label="Preenchimento atual">Atual</th>
                <th scope="col">Rascunho de voz</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(([field, current, proposed]) => (
                <tr key={field}>
                  <th scope="row">{field}</th>
                  <td>{current || "Em branco"}</td>
                  <td>{proposed || "Em branco"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="editor-actions">
          <button
            type="button"
            className="primary"
            ref={keepEditing}
            onClick={dismissConfirmation}
          >
            {confirmClose ? "Continuar editando" : "Manter meu preenchimento"}
          </button>
          {confirmClose ? (
            <button type="button" className="text editor-discard" onClick={() => done()}>
              Descartar e fechar
            </button>
          ) : draftToReview && (
            <button type="button" className="secondary" onClick={() => applyDraft(draftToReview)}>
              Usar rascunho
            </button>
          )}
        </div>
      </dialog>
    </dialog>
  );
}
