import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const themeKey = "budgeting-theme";
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

function storedTheme(): Theme | null {
  try {
    const theme = localStorage.getItem(themeKey);
    return theme === "light" || theme === "dark" ? theme : null;
  } catch {
    return null;
  }
}

let chosenTheme = storedTheme();

function currentTheme(): Theme {
  return chosenTheme ?? (systemTheme.matches ? "dark" : "light");
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  return theme;
}

applyTheme(currentTheme());

export function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme);
  const dark = theme === "dark";

  useEffect(() => {
    const update = () => setTheme(applyTheme(currentTheme()));
    update();
    systemTheme.addEventListener("change", update);
    return () => systemTheme.removeEventListener("change", update);
  }, []);

  function toggle() {
    chosenTheme = dark ? "light" : "dark";
    setTheme(applyTheme(chosenTheme));
    try {
      localStorage.setItem(themeKey, chosenTheme);
    } catch {
      // The theme remains active for this page if storage is unavailable.
    }
  }

  return (
    <button
      type="button"
      className="text theme-toggle"
      aria-label="Tema escuro"
      aria-pressed={dark}
      title={dark ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={toggle}
    >
      <span aria-hidden="true">{dark ? "☀︎" : "☾"}</span>
    </button>
  );
}
