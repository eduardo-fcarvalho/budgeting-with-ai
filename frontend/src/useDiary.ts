import { useCallback, useEffect, useRef, useState } from "react";
import { api, HttpError, isNetworkError, message, type Session } from "./api";
import {
  assertCurrent,
  change,
  forgetSnapshot,
  revoke,
  current,
  markerKey,
  same,
  saveSnapshot,
  snapshot,
  type Marker,
} from "./storage";
import { type Expense, type Snapshot } from "./domain";

export function useDiary() {
  const [marker, setMarker] = useState<Marker | null>(null);
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [online, setOnline] = useState(false);
  const [notice, setNotice] = useState("");
  const csrf = useRef("");
  const markerRef = useRef<Marker | null>(null);
  const jobs = useRef(0);
  const adopt = (next: Marker | null) => {
    if (!same(next, markerRef.current)) setData(null);
    markerRef.current = next;
    setMarker(next);
  };
  const task = useCallback(async <T>(run: () => Promise<T>) => {
    jobs.current++;
    setBusy(true);
    try {
      return await navigator.locks.request("budgeting-session", run);
    } finally {
      jobs.current--;
      setBusy(jobs.current !== 0);
    }
  }, []);
  async function load(active: Marker) {
    assertCurrent(active);
    const headers = { "X-Account-ID": active.user };
    const [expenses, categories] = await Promise.all([
      api<Expense[]>("expenses", { headers }),
      api<string[]>("categories", { headers }),
    ]);
    assertCurrent(active);
    const next = { expenses, categories, syncedAt: new Date().toISOString() };
    setData(next);
    try {
      await saveSnapshot(active, next);
    } catch (error) {
      assertCurrent(active);
      setNotice(
        "Os dados estão atualizados. Falhou a gravação da cópia offline neste aparelho.",
      );
    }
  }
  const refresh = useCallback(async () => {
    try {
      await task(async () => {
        let active = current();
        if (!same(active, markerRef.current)) adopt(null);
        if (active?.pending) await forgetSnapshot(active);
        let session: Session;
        try {
          session = await api<Session>("session");
        } catch (err) {
          if (!isNetworkError(err)) throw err;
          setOnline(false);
          if (active && !active.pending) {
            const stored = await snapshot(active);
            adopt(active);
            setData(stored || null);
          } else adopt(null);
          setNotice(
            "Consulta offline. Reconecte para registrar ou atualizar gastos.",
          );
          return;
        }
        assertCurrent(active);
        if (active?.pending) {
          if (session.user === active.user) {
            await api("logout", {
              method: "POST",
              headers: { "X-CSRF-TOKEN": session.csrf },
            });
            session = await api<Session>("session");
          }
          active = await change(active, null);
        }
        if (active?.user !== (session.user ?? undefined))
          active = await change(active, session.user);
        adopt(active);
        csrf.current = session.csrf;
        setOnline(true);
        setNotice("");
        if (active) {
          try {
            await load(active);
          } catch (error) {
            if (!isNetworkError(error)) throw error;
            const stored = await snapshot(active);
            setData(stored || null);
            throw error;
          }
        }
      });
    } catch (err) {
      setOnline(false);
      if (!isNetworkError(err)) {
        adopt(null);
        setData(null);
      }
      setNotice(message(err));
    }
  }, [task]);

  useEffect(() => {
    const reload = (e: StorageEvent) => {
      if (e.key !== markerKey && e.key !== null) return;
      if (!same(current(), markerRef.current)) {
        adopt(null);
        setOnline(false);
        void refresh();
      }
    };
    const visible = () => {
      if (!document.hidden) {
        if (!same(current(), markerRef.current)) adopt(null);
        void refresh();
      }
    };
    const offline = () => {
      setOnline(false);
      setNotice(
        "Consulta offline. Reconecte para registrar ou atualizar gastos.",
      );
    };
    void refresh();
    addEventListener("storage", reload);
    addEventListener("online", refresh);
    addEventListener("offline", offline);
    addEventListener("pageshow", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      removeEventListener("storage", reload);
      removeEventListener("online", refresh);
      removeEventListener("offline", offline);
      removeEventListener("pageshow", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  async function login(email: string, password: string) {
    await task(async () => {
      const active = current();
      if (active?.pending)
        throw new Error("Reconecte e sincronize a saída antes de entrar.");
      const session = await api<Session>("session");
      assertCurrent(active);
      if (session.user)
        throw new Error(
          "Há uma sessão ativa. Atualize a página antes de entrar.",
        );
      try {
        await api("login", {
          method: "POST",
          headers: { "X-CSRF-TOKEN": session.csrf },
          body: new URLSearchParams({ username: email, password }),
        });
      } catch (error) {
        if (error instanceof HttpError && error.status === 401)
          throw new Error("E-mail ou senha inválidos.");
        throw error;
      }
    });
    await refresh();
  }
  async function logout() {
    const active = markerRef.current;
    if (!active) return;
    adopt(null);
    setOnline(false);
    setData(null);
    try {
      // Tombstone survives a lost connection until the server accepts logout.
      // Mark synchronously: the user can close the tab before a slow request ends.
      revoke(active);
      await forgetSnapshot(active);
    } catch (error) {
      setNotice(message(error));
      return;
    }
    await refresh();
  }
  async function mutate<T>(path: string, method: string, body?: BodyInit) {
    const active = markerRef.current;
    if (!active || !online) throw new Error("Reconecte para continuar.");
    try {
      return await task(async () => {
        assertCurrent(active);
        const headers: Record<string, string> = {
          "X-CSRF-TOKEN": csrf.current,
          "X-Account-ID": active.user,
        };
        if (typeof body === "string")
          headers["Content-Type"] = "application/json";
        const result = await api<T>(path, { method, body, headers });
        assertCurrent(active);
        if (path !== "drafts") await load(active);
        return result;
      });
    } catch (error) {
      if (error instanceof HttpError && [401, 403, 409].includes(error.status))
        await refresh();
      throw error;
    }
  }
  return { marker, data, busy, online, notice, refresh, login, logout, mutate };
}
