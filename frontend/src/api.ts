export class HttpError extends Error {
  status: number;
  constructor(status: number) {
    const descriptions: Record<number, string> = {
      400: "Confira os campos e tente novamente.",
      401: "Entre novamente para continuar.",
      403: "Sua sessão mudou. Atualize a página.",
      409: "Os dados mudaram. Atualize o histórico.",
      413: "A gravação é muito longa.",
      422: "O áudio precisa de revisão. Digite ou grave novamente.",
      429: "O limite de voz foi atingido. Você pode digitar o gasto.",
      503: "Serviço temporariamente indisponível. Você pode digitar o gasto.",
    };
    super(descriptions[status] || "Falha no servidor. Tente novamente.");
    this.status = status;
  }
}
export type Session = { user: string | null; csrf: string };
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch("/api/" + path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    signal:
      init.signal || AbortSignal.timeout(path === "drafts" ? 75000 : 20000),
  });
  if (!response.ok) throw new HttpError(response.status);
  if (response.headers.get("content-type")?.includes("json"))
    return response.json();
  return undefined as T;
}
export function isNetworkError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === "TimeoutError")
  );
}
export function message(error: unknown) {
  return isNetworkError(error)
    ? "Sem resposta do servidor. Confira a conexão."
    : error instanceof Error
      ? error.message
      : "Não foi possível concluir.";
}
