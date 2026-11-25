import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const profiles = new Map();
let account = null;
let server;
let url;
test.beforeAll(async () => {
  // Fictitious single browser session. Data reads also assert the active owner.
  server = createServer(async (req, res) => {
    const { pathname: path } = new URL(req.url, "http://localhost");
    if (path.startsWith("/api/")) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const body = bytes.toString();
      const send = (data, status = 200) => {
        res.writeHead(status, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(data));
      };
      if (req.method !== "GET" && req.headers["x-csrf-token"] !== "fixture")
        return send({}, 403);
      if (path === "/api/session")
        return send({ user: account, csrf: "fixture" });
      if (path === "/api/login") {
        account = new URLSearchParams(body).get("username");
        if (!profiles.has(account)) profiles.set(account, new Map());
        return send({});
      }
      if (path === "/api/logout") {
        account = null;
        return send({});
      }
      if (!account || req.headers["x-account-id"] !== account)
        return send({}, 409);
      const rows = profiles.get(account);
      if (path === "/api/drafts") {
        const start = bytes.indexOf("RIFF");
        if (start < 0 || bytes.readUInt32LE(start + 24) !== 16000)
          return send({}, 400);
        return send({
          description: "Gasto por voz",
          amount: 4290,
          date: "2026-03-15",
          category: "Café",
        });
      }
      if (path === "/api/expenses" && req.method === "GET")
        return send([...rows.values()]);
      if (path === "/api/categories")
        return send([...new Set([...rows.values()].map((x) => x.category))]);
      if (path.startsWith("/api/expenses")) {
        if (req.method === "DELETE") rows.delete(path.split("/").pop());
        else {
          const row = JSON.parse(body);
          rows.set(row.id, row);
        }
        return send({});
      }
      return send({}, 404);
    }
    try {
      const file = path === "/" ? "index.html" : path.slice(1);
      const bytes = await readFile(new URL("../dist/" + file, import.meta.url));
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".webmanifest": "application/manifest+json",
      };
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = "http://127.0.0.1:" + server.address().port;
});
test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function login(page, email) {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("somente-teste");
  await page.getByRole("button", { name: "Acessar meu diário" }).click();
}

test("consulta offline e logout eliminam o histórico em todas as abas", async ({
  page,
  context,
}) => {
  await page.goto(url);
  await login(page, "a@example.test");
  const add = page.getByRole("button", { name: "Novo gasto" });
  await expect(add).toBeEnabled();
  const bounds = await add.boundingBox();
  expect(bounds.x + bounds.width / 2).toBeCloseTo(page.viewportSize().width / 2, 0);
  await add.click();
  await expect(page.getByLabel("Valor (R$)", { exact: true })).toBeFocused();
  await page.getByLabel("Descrição").fill("Almoço de teste");
  await page.getByLabel("Valor (R$)", { exact: true }).fill("42,90");
  await page.getByLabel("Categoria", { exact: true }).fill("Restaurantes");
  await page.getByRole("button", { name: "Confirmar gasto" }).click();
  await expect(
    page.getByRole("heading", { name: "Almoço de teste" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Valor (R$)", { exact: true }).fill("43,90");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.locator(".summary>strong")).toContainText("43,90");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBeTruthy();
  const second = await context.newPage();
  await second.goto(url);
  await expect(
    second.getByRole("heading", { name: "Almoço de teste" }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Almoço de teste" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo gasto" })).toBeDisabled();
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(second.getByLabel("E-mail")).toBeVisible();
  await context.setOffline(false);
  await expect.poll(() => account).toBeNull();
  await login(page, "b@example.test");
  await expect(
    page.getByText("Nenhum gasto em", { exact: false }),
  ).toBeVisible();
  await expect(
    second.getByText("Nenhum gasto em", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Almoço de teste")).toHaveCount(0);
  const count = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open("budgeting-history");
      r.onsuccess = () => resolve(r.result);
    });
    return await new Promise((resolve) => {
      const r = db.transaction("history").objectStore("history").getAll();
      r.onsuccess = () => resolve(r.result.flatMap((s) => s.expenses).length);
    });
  });
  expect(count).toBe(0);
});

test("voz abre rascunho editável e descartar mantém o histórico intacto", async ({
  page,
  context,
}) => {
  account = null;
  await context.grantPermissions(["microphone"], { origin: url });
  await page.goto(url);
  await login(page, "voz@example.test");
  await page.getByRole("button", { name: "Novo gasto" }).click();
  await page.getByRole("button", { name: "Gravar gasto" }).click();
  const stop = page.getByRole("button", { name: "Parar e interpretar" });
  await expect(stop).toBeEnabled();
  // Allow the fake microphone to deliver at least one audio frame.
  await page.waitForTimeout(450);
  await stop.click();
  await expect(page.getByLabel("Descrição")).toHaveValue("Gasto por voz");
  await expect(page.getByLabel("Valor (R$)", { exact: true })).toHaveValue(
    "42,90",
  );
  await expect(page.getByLabel("Categoria", { exact: true })).toHaveValue(
    "Café",
  );
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  expect(profiles.get(account).size).toBe(0);
  await expect(
    page.getByText("Nenhum gasto em", { exact: false }),
  ).toBeVisible();
});

test("atalho do manifesto abre a voz e preserva a alternativa de um toque", async ({
  page,
  context,
}) => {
  account = null;
  await page.goto(url);
  const response = await page.request.get(url + "/manifest.webmanifest");
  const manifest = await response.json();
  const shortcut = manifest.shortcuts.find(({ name }) => name === "Gravar gasto");
  expect(shortcut).toBeDefined();

  await page.goto(new URL(shortcut.url, url).href);
  await login(page, "atalho@example.test");
  await expect(page.getByRole("dialog")).toBeVisible();
  const start = page.getByRole("button", { name: "Gravar gasto", exact: true });
  await expect(start).toBeFocused();
  await expect(page).toHaveURL(url + "/");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBeTruthy();
  await context.setOffline(true);
  await page.goto(new URL(shortcut.url, url).href);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(start).toBeDisabled();
});

test("atalho da PWA em primeiro plano usa o microfone já autorizado", async ({
  page,
  context,
}) => {
  account = null;
  let audioRequests = 0;
  page.on("request", (request) => {
    if (request.url() === url + "/api/drafts") audioRequests++;
  });
  await context.grantPermissions(["microphone"], { origin: url });
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) =>
      query === "(display-mode: standalone)" ? { matches: true } : original(query);
  });
  await page.goto(url);
  await login(page, "instalado@example.test");
  await expect(page.getByRole("button", { name: "Novo gasto" })).toBeEnabled();
  const stop = page.getByRole("button", { name: "Parar e interpretar" });
  const start = page.getByRole("button", { name: "Gravar gasto", exact: true });
  await page.goto(url + "/?acao=gravar");
  await expect(stop).toBeEnabled();
  await page.getByRole("button", { name: "Cancelar gravação" }).click();
  await expect(start).toBeEnabled();

  await page.clock.install();
  await page.goto(url + "/?acao=gravar");
  await expect(stop).toBeEnabled();
  await page.clock.fastForward(30_001);
  await expect(start).toBeEnabled();

  await page.goto(url + "/?acao=gravar");
  await expect(stop).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(start).toBeEnabled();
  expect(audioRequests).toBe(0);
  expect(profiles.get(account).size).toBe(0);
});

test("totais por categoria acompanham o período e filtram o histórico", async ({
  page,
}) => {
  account = null;
  const fixtures = [
    ["2026-03-15", "Almoço de domingo", 5000, "Alimentação"],
    ["2026-03-09", "Ônibus de segunda", 1000, "Transporte"],
    ["2026-03-08", "Café da semana anterior", 2000, "Alimentação"],
    ["2026-01-21", "Mercado de janeiro", 3000, "Mercado"],
  ];
  const rows = fixtures.map(([date, description, amount, category], index) => {
    const id = String(index);
    return [id, { id, date, description, amount, category }];
  });
  profiles.set("periodo@example.test", new Map(rows));
  await page.clock.setFixedTime(new Date(2026, 2, 15, 12));
  await page.goto(url);
  await login(page, "periodo@example.test");
  const categories = page.getByRole("region", { name: "Por categoria" });
  const food = categories.getByRole("button", { name: /Alimentação/ });
  const transport = categories.getByRole("button", { name: /Transporte/ });
  const market = categories.getByRole("button", { name: /Mercado/ });
  const lunch = page.getByRole("heading", { name: "Almoço de domingo" });
  const bus = page.getByRole("heading", { name: "Ônibus de segunda" });
  const coffee = page.getByRole("heading", { name: "Café da semana anterior" });
  const groceries = page.getByRole("heading", { name: "Mercado de janeiro" });
  await expect(lunch).toBeVisible();
  await expect(coffee).toBeVisible();
  await expect(groceries).toHaveCount(0);
  await expect(food).toContainText("70,00");
  await expect(transport).toContainText("12,5%");
  await expect(categories.getByRole("button")).toHaveCount(2);

  await page.getByRole("button", { name: "Diário", exact: true }).click();
  await expect(lunch).toBeVisible();
  await expect(bus).toHaveCount(0);
  await expect(food).toContainText("50,00");
  await expect(food).toContainText("100%");
  await expect(transport).toHaveCount(0);
  await page.getByRole("button", { name: "Semanal", exact: true }).click();
  await expect(bus).toBeVisible();
  await expect(coffee).toHaveCount(0);
  await expect(food).toContainText("83,3%");
  await expect(transport).toContainText("10,00");
  await page.getByRole("button", { name: "Anual", exact: true }).click();
  await expect(groceries).toBeVisible();
  await expect(food).toContainText("63,6%");
  await expect(market).toContainText("30,00");

  await food.click();
  await expect(food).toHaveAttribute("aria-pressed", "true");
  await expect(lunch).toBeVisible();
  await expect(coffee).toBeVisible();
  await expect(bus).toHaveCount(0);
  await page.getByRole("button", { name: "Limpar filtro" }).click();
  await expect(bus).toBeVisible();
  await page.getByRole("button", { name: "Mensal", exact: true }).click();
  await page.getByLabel("Selecionar mês").fill("2026-01");
  await expect(groceries).toBeVisible();
  await expect(market).toContainText("100%");
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(groceries).toHaveCount(0);
  await expect(categories.getByText("Sem gastos neste período.")).toBeVisible();
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(groceries).toBeVisible();
});

test("tema segue o sistema e lembra a escolha no diário e no login", async ({
  page,
}) => {
  account = null;
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(url);
  const toggle = page.getByRole("button", { name: "Tema escuro" });
  const root = page.locator("html");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(root).toHaveCSS("color-scheme", "dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await login(page, "tema@example.test");
  await expect(page.getByRole("heading", { name: "Meus gastos" })).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(root).toHaveCSS("color-scheme", "dark");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Meus gastos" })).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(root).toHaveCSS("color-scheme", "light");
});
