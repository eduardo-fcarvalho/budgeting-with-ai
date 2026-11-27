export function consumeVoiceShortcut() {
  const url = new URL(location.href);
  if (url.searchParams.get("acao") !== "gravar") return false;
  url.searchParams.delete("acao");
  history.replaceState(history.state, "", url);
  return true;
}

export async function canStartShortcutRecording() {
  if (!matchMedia("(display-mode: standalone)").matches || document.referrer) {
    return false;
  }
  try {
    const permission = await navigator.permissions.query({ name: "microphone" });
    return permission.state === "granted" && !document.hidden;
  } catch {
    return false;
  }
}
