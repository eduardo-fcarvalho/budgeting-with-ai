import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { message } from "./api";
import { localDate, type Draft } from "./domain";
import { Icon } from "./Icon";
import { record } from "./microphone";
import type { useDiary } from "./useDiary";

type VoiceState = "idle" | "starting" | "recording" | "sending";

const limitSeconds = 30;
const statusText: Record<VoiceState, string> = {
  idle: "Você vai revisar o rascunho antes de confirmar.",
  starting: "Aguardando acesso ao microfone.",
  recording: "Gravando por até 30 segundos.",
  sending: "Preparando seu rascunho…",
};

export function VoiceRecorder({
  diary,
  onDraft,
  onManual,
}: {
  diary: ReturnType<typeof useDiary>;
  onDraft: (draft: Draft) => void;
  onManual: () => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<(() => Blob) | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useLayoutEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (state !== "recording") return;
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      setElapsed(
        Math.min(limitSeconds, Math.floor((performance.now() - startedAt) / 1000)),
      );
    }, 250);
    return () => window.clearInterval(timer);
  }, [state]);

  async function finish() {
    const stop = stopRef.current;
    const session = abortRef.current;
    if (!stop || !session || session.signal.aborted) return;
    stopRef.current = null;
    setState("sending");
    try {
      const body = new FormData();
      body.set("audio", stop(), "gasto.wav");
      body.set("date", localDate());
      const draft = await diary.mutate<Draft>("drafts", "POST", body);
      if (!session.signal.aborted) onDraft(draft);
    } catch (err) {
      if (!session.signal.aborted) setError(message(err));
    } finally {
      if (!session.signal.aborted) {
        abortRef.current = null;
        setState("idle");
      }
    }
  }

  async function start() {
    if (abortRef.current) return;
    setError("");
    setElapsed(0);
    setState("starting");
    const session = new AbortController();
    abortRef.current = session;
    try {
      const stop = await record(() => {
        if (!session.signal.aborted) void finish();
      }, session.signal);
      if (!session.signal.aborted) {
        stopRef.current = stop;
        setState("recording");
      }
    } catch (err) {
      if (session.signal.aborted) return;
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permita o acesso ao microfone no navegador ou preencha o gasto manualmente."
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
    button.current?.focus();
  }

  const unavailable =
    state === "starting" ||
    state === "sending" ||
    (state === "idle" && (!diary.online || diary.busy));

  return (
    <div className="voice-recorder" data-state={state}>
      <div className="voice-stage">
        <div className="voice-orb" aria-hidden="true">
          <Icon name={state === "sending" ? "sparkles" : "mic"} />
        </div>
        <div className="voice-pulse" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="voice-timer" role="timer" aria-label="Tempo de gravação">
          00:{String(elapsed).padStart(2, "0")} <span>/ 00:30</span>
        </div>
      </div>
      <p className="voice-status" role="status">
        {diary.online ? statusText[state] : "A gravação precisa de conexão."}
      </p>
      {error && <p className="editor-alert" role="alert">{error}</p>}
      <button
        type="button"
        className="primary voice-record"
        ref={button}
        data-editor-focus={diary.online ? "" : undefined}
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
      <button type="button" className="text editor-mode" onClick={onManual}>
        <Icon name="keyboard" /> Preencher manualmente
      </button>
    </div>
  );
}
