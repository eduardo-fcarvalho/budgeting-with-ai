export function consumeVoiceShortcut() {
  const url = new URL(location.href);
  if (url.searchParams.get("acao") !== "gravar") return false;
  url.searchParams.delete("acao");
  history.replaceState(history.state, "", url);
  return true;
}
