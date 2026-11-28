import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const profiles = new Map();
const loginPassword = "somente-teste";
let account = null;
let server;
let url;
let shellRevision = "";
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
      if (!account) return send({}, 401);
      if (req.headers["x-account-id"] !== account) return send({}, 409);
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
      let body = bytes;
      if (shellRevision && file === "index.html") {
        body = bytes
          .toString()
          .replace("</title>", ` (${shellRevision})</title>`);
      }
      if (shellRevision && file === "sw.js") {
        body = bytes
          .toString()
          .replace(/(const name = "[^"]+)(";)/, `$1-${shellRevision}$2`);
      }
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
      res.end(body);
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
  // Playwright inclui o argumento de fill nos logs quando a ação falha.
  await page.getByLabel("E-mail").evaluate((field, value) => { field.value = value; }, email);
  await page.getByLabel("Senha").evaluate((field, value) => { field.value = value; }, loginPassword);
  await page.getByRole("button", { name: "Acessar meu diário" }).click();
}

async function cachedHistoryCounts(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("budgeting-history");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("history").objectStore("history").getAll();
        request.onsuccess = () => resolve({
          snapshots: request.result.length,
          expenses: request.result.flatMap((snapshot) => snapshot.expenses).length,
        });
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
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
  await page.getByRole("dialog", { name: "Novo gasto" })
    .getByRole("button", { name: "Preencher manualmente" }).click();
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
  await expect(page.getByRole("button", { name: "Registrar por voz" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
  const cachedPaths = await page.evaluate(async () => {
    const entries = await Promise.all((await caches.keys()).map(async (key) =>
      (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname)
    ));
    return entries.flat();
  });
  expect(cachedPaths.some((path) => path.startsWith("/api/"))).toBe(false);
  await page.getByRole("button", { name: "Ajustes" }).click();
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
  expect((await cachedHistoryCounts(page)).expenses).toBe(0);
});

test("sair revoga a sessão mesmo quando a cópia offline não pode ser apagada", async ({ page }) => {
  account = null;
  const email = "falha-de-limpeza@example.test";
  const expense = { id: "sair", date: "2026-03-15", description: "Gasto fictício de saída", amount: 850, category: "Transporte" };
  profiles.set(email, new Map([[expense.id, expense]]));
  await page.clock.setFixedTime(new Date(2026, 2, 15, 12));
  await page.addInitScript(() => {
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (key) {
      if (this.name === "history" && !window.allowHistoryDelete)
        throw new DOMException("Falha simulada na limpeza.", "UnknownError");
      return remove.call(this, key);
    };
  });
  await page.goto(url);
  await login(page, email);
  const saved = page.getByRole("heading", { name: expense.description });
  await expect(saved).toBeVisible();
  await expect.poll(() => cachedHistoryCounts(page)).toEqual({ snapshots: 1, expenses: 1 });

  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByRole("status")).toHaveText("Falha simulada na limpeza.");
  const historyStatus = () => page.evaluate(async (user) => {
    const response = await fetch("/api/expenses", {
      cache: "no-store",
      headers: { "X-Account-ID": user },
    });
    return response.status;
  }, email);
  expect(await historyStatus()).toBe(401);
  expect(await cachedHistoryCounts(page)).toEqual({ snapshots: 1, expenses: 1 });

  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Falha simulada na limpeza.");
  await expect(saved).toHaveCount(0);
  await login(page, "nova-conta@example.test");
  await expect(page.getByRole("status")).toHaveText("Reconecte e sincronize a saída antes de entrar.");
  expect(await historyStatus()).toBe(401);

  await page.evaluate(() => { window.allowHistoryDelete = true; });
  await page.getByRole("button", { name: "Verificar conexão" }).click();
  await expect.poll(() => cachedHistoryCounts(page)).toEqual({ snapshots: 0, expenses: 0 });
  await login(page, "nova-conta@example.test");
  await expect(page.getByText("Nenhum gasto em", { exact: false })).toBeVisible();
  await expect(saved).toHaveCount(0);
});

test("sessão revogada enquanto offline elimina a cópia ao reconectar", async ({ page, context }) => {
  account = null;
  const email = "sessao-revogada@example.test";
  const expense = { id: "revogado", date: "2026-03-15", description: "Passagem fictícia", amount: 850, category: "Transporte" };
  profiles.set(email, new Map([[expense.id, expense]]));
  await page.clock.setFixedTime(new Date(2026, 2, 15, 12));
  await page.goto(url);
  await login(page, email);
  const saved = page.getByRole("heading", { name: expense.description });
  await expect(saved).toBeVisible();
  await expect.poll(() => cachedHistoryCounts(page)).toEqual({ snapshots: 1, expenses: 1 });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  account = null;
  await page.reload();
  await expect(saved).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo gasto" })).toBeDisabled();

  const sessionCheck = page.waitForResponse((response) => response.url() === url + "/api/session");
  await context.setOffline(false);
  expect((await sessionCheck).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(saved).toHaveCount(0);
  expect(await cachedHistoryCounts(page)).toEqual({ snapshots: 0, expenses: 0 });
});

test("voz abre rascunho editável e descartar mantém o histórico intacto", async ({
  page,
  context,
}) => {
  account = null;
  await context.grantPermissions(["microphone"], { origin: url });
  await page.goto(url);
  await login(page, "voz@example.test");
  let requests = 0;
  page.on("request", (request) => { if (request.url() === url + "/api/drafts") requests++; });
  await page.getByRole("button", { name: "Novo gasto" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar por voz" }).click();
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
  await expect(page.getByRole("heading", { name: "Revisar rascunho" })).toBeFocused();
  await page.getByLabel("Descrição").fill("Descrição revisada");
  const discard = page.getByRole("button", { name: "Descartar rascunho", exact: true });
  const confirmation = page.getByRole("dialog", { name: "Descartar rascunho?" });
  await discard.click();
  const keepEditing = confirmation.getByRole("button", { name: "Continuar editando" });
  await expect(keepEditing).toBeFocused();
  await keepEditing.click();
  await expect(page.getByLabel("Descrição")).toHaveValue("Descrição revisada");
  await expect(discard).toBeFocused();
  await discard.click();
  await confirmation.getByRole("button", { name: "Descartar e fechar" }).click();
  expect(requests).toBe(1);
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

test("atalho instalado abre a voz sem capturar até o toque explícito", async ({ page, context }) => {
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
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.captureStarts = 0;
    navigator.mediaDevices.getUserMedia = (...args) => {
      window.captureStarts++;
      return capture(...args);
    };
  });
  await page.goto(url + "/?acao=gravar");
  await login(page, "instalado@example.test");
  const start = page.getByRole("button", { name: "Gravar gasto", exact: true });
  const stop = page.getByRole("button", { name: "Parar e interpretar" });
  await expect(start).toBeFocused();
  expect(await page.evaluate(() => window.captureStarts)).toBe(0);
  await start.click();
  await expect(stop).toBeEnabled();
  expect(await page.evaluate(() => window.captureStarts)).toBe(1);
  await page.getByRole("button", { name: "Cancelar gravação" }).click();
  await expect(start).toBeFocused();
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

  await page.setViewportSize({ width: 320, height: 700 });
  await food.click();
  await expect(food).toHaveAccessibleName(/Filtrar gastos recentes por Alimentação/);
  await expect(food).toHaveAttribute("aria-pressed", "true");
  const filtered = categories.getByRole("button", { name: "Ver gastos filtrados" });
  await expect(filtered).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await filtered.focus();
  await page.keyboard.press("Enter");
  const recentTitle = page.getByRole("heading", { name: "Gastos recentes" });
  await expect(recentTitle).toBeFocused();
  await expect(recentTitle).toBeInViewport();
  await expect(page).toHaveURL(url + "/");
  await expect(lunch).toBeVisible();
  await expect(coffee).toBeVisible();
  await expect(bus).toHaveCount(0);
  await page.getByRole("button", { name: "Limpar filtro" }).click();
  await expect(food).toHaveAttribute("aria-pressed", "false");
  await expect(filtered).toHaveCount(0);
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
  await page.getByRole("button", { name: "Ajustes" }).click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(root).toHaveCSS("color-scheme", "dark");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(root).toHaveCSS("color-scheme", "light");
});

test("recarregar recebe a nova versão mesmo com outra aba aberta", async ({
  page,
  context,
}) => {
  account = null;
  await page.goto(url);
  const originalTitle = await page.title();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBeTruthy();
  const second = await context.newPage();
  await second.goto(url);

  shellRevision = "atualizada";
  try {
    await page.reload();
    await expect(page).toHaveTitle(`${originalTitle} (atualizada)`);
    await expect(second).toHaveTitle(originalTitle);
    await expect.poll(() =>
      page.evaluate(async () => {
        const shells = (await caches.keys()).filter((key) =>
          key.startsWith("budgeting-shell-"),
        );
        return shells.length === 1 && shells[0].endsWith("-atualizada");
      }),
    ).toBeTruthy();
    await context.setOffline(true);
    await page.reload();
    await expect(page).toHaveTitle(`${originalTitle} (atualizada)`);
  } finally {
    shellRevision = "";
  }
});

test("navegação responsiva, foco do editor e movimento reduzido", async ({ page }) => {
  account = null;
  const email = "navegacao@example.test";
  const date = "2026-03-15";
  const names = ["Mercado", "Transporte", "Casa", "Lazer", "Café", "Oficina"];
  profiles.set(email, new Map(names.map((category, index) => {
    const id = String(index);
    return [id, { id, category, date, amount: 1500 + index, description: `Gasto de ${category}` }];
  })));
  await page.clock.setFixedTime(new Date(2026, 2, 15, 12));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  await login(page, email);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const add = nav.getByRole("button", { name: "Novo gasto" });
  await expect(add).toBeEnabled();
  await expect(page.locator(".category-donut")).toHaveCount(0);
  await expect(page.locator(".bar-value")).toHaveCount(6);
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 852 });
    const bounds = await add.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    if (width < 1024) expect(bounds.x + bounds.width / 2).toBeCloseTo(width / 2, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await page.setViewportSize({ width: 390, height: 852 });
  await nav.getByRole("button", { name: "Análises" }).click();
  await expect(nav.getByRole("button", { name: "Análises" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page).toHaveURL(/#analises$/);
  const duration = await page.locator(".screen-content").evaluate((element) =>
    parseFloat(getComputedStyle(element).animationDuration)
  );
  expect(duration).toBeLessThan(0.001);
  const marketCategory = page.getByRole("button", { name: /Ver gastos de Mercado no histórico/ });
  await marketCategory.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#historico$/);
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByRole("button", { name: "Limpar filtro" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gasto de Mercado" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gasto de Casa" })).toHaveCount(0);
  await nav.getByRole("button", { name: "Início" }).click();
  await expect(page.getByRole("heading", { name: "Gasto de Casa" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Limpar filtro" })).toBeVisible();
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page.getByRole("button", { name: "Limpar filtro" })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Análises" })).toBeVisible();

  await add.click();
  await page.getByRole("dialog", { name: "Novo gasto" })
    .getByRole("button", { name: "Preencher manualmente" }).click();
  const dialog = page.getByRole("dialog", { name: "Novo gasto" });
  const price = dialog.getByLabel("Valor (R$)", { exact: true });
  await expect(price).toBeFocused();
  await page.setViewportSize({ width: 390, height: 430 });
  expect(await dialog.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(430);
  await dialog.getByRole("button", { name: "Confirmar gasto" }).click();
  await expect(price).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByRole("alert")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
});

test("exclusão mantém confirmação e não remove se cancelada", async ({ page }) => {
  account = null;
  const email = "exclusao@example.test";
  const expense = { id: "excluir", category: "Casa", date: "2026-03-15", amount: 1500, description: "Gasto a excluir" };
  profiles.set(email, new Map([[expense.id, expense]]));
  await page.clock.setFixedTime(new Date(2026, 2, 15, 12));
  await page.goto(url);
  await login(page, email);
  const remove = page.getByRole("button", { name: "Excluir", exact: true });
  await remove.click();
  await expect(page.getByText("Excluir este gasto?")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(remove).toBeFocused();
  expect(profiles.get(email).size).toBe(1);
  await remove.click();
  await page.getByRole("button", { name: "Sim, excluir" }).click();
  await expect(page.getByText("Gasto excluído.")).toBeVisible();
  expect(profiles.get(email).size).toBe(0);
});

test("limite de voz gera um rascunho que só é salvo ao confirmar", async ({ page, context }) => {
  account = null;
  const email = "voz-limite@example.test";
  await context.grantPermissions(["microphone"], { origin: url });
  await page.clock.install({ time: new Date(2026, 2, 15, 12) });
  await page.goto(url);
  await login(page, email);
  let requests = 0;
  page.on("request", (request) => {
    if (request.url() === url + "/api/drafts") requests++;
  });
  await page.getByRole("button", { name: "Registrar por voz" }).click();
  await page.getByRole("button", { name: "Gravar gasto" }).click();
  const stop = page.getByRole("button", { name: "Parar e interpretar" });
  await expect(stop).toBeEnabled();
  // Let the fake microphone deliver audio before moving the browser clock.
  await page.waitForTimeout(450);
  await page.clock.fastForward(30_001);
  await expect(page.getByRole("heading", { name: "Revisar rascunho" })).toBeFocused();
  expect(requests).toBe(1);
  expect(profiles.get(email).size).toBe(0);
  await page.getByLabel("Descrição").fill("Gasto de voz revisado");
  await page.getByRole("button", { name: "Confirmar gasto" }).click();
  await expect(page.getByRole("heading", { name: "Gasto de voz revisado" })).toBeVisible();
  expect([...profiles.get(email).values()]).toMatchObject([
    { description: "Gasto de voz revisado", amount: 4290, category: "Café" },
  ]);
  expect(requests).toBe(1);
});

test("protege o preenchimento ao fechar e aceita moeda copiada", async ({ page }) => {
  account = null;
  const email = "preenchimento@example.test";
  await page.goto(url);
  await login(page, email);
  const add = page.getByRole("button", { name: "Novo gasto" });
  await add.click();
  await page.getByRole("dialog", { name: "Novo gasto" })
    .getByRole("button", { name: "Preencher manualmente" }).click();
  const editor = page.getByRole("dialog", { name: "Novo gasto" });
  const description = editor.getByLabel("Descrição");
  const price = editor.getByLabel("Valor (R$)", { exact: true });
  await description.fill("Gasto fictício");
  await price.fill("R$\u00a01.234,56");
  await editor.getByLabel("Categoria", { exact: true }).fill("Casa");

  await page.keyboard.press("Escape");
  const confirm = page.getByRole("dialog", { name: "Descartar preenchimento?" });
  const keepEditing = confirm.getByRole("button", { name: "Continuar editando" });
  await expect(keepEditing).toBeFocused();
  await keepEditing.click();
  await expect(price).toHaveValue("R$\u00a01.234,56");
  await expect(description).toHaveValue("Gasto fictício");
  await expect(editor.getByLabel("Categoria", { exact: true })).toHaveValue("Casa");

  await editor.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Descartar e fechar" }).click();
  await expect(editor).toHaveCount(0);
  await expect(add).toBeFocused();
  expect(profiles.get(email).size).toBe(0);

  await add.click();
  await page.getByRole("dialog", { name: "Novo gasto" })
    .getByRole("button", { name: "Preencher manualmente" }).click();
  await expect(price).toHaveValue("");
  await price.fill("R$\u00a01.234,56");
  await description.fill("Gasto fictício");
  await editor.getByLabel("Categoria", { exact: true }).fill("Casa");
  await editor.getByRole("button", { name: "Confirmar gasto" }).click();
  await expect(page.getByRole("heading", { name: "Gasto fictício" })).toBeVisible();
  expect([...profiles.get(email).values()][0].amount).toBe(123456);
});

test("o rascunho de voz só substitui o preenchimento se escolhido", async ({ page, context }) => {
  account = null;
  const email = "substituicao@example.test";
  await page.setViewportSize({ width: 320, height: 700 });
  await context.grantPermissions(["microphone"], { origin: url });
  await page.goto(url);
  await login(page, email);
  let drafts = 0;
  page.on("request", (request) => {
    if (request.url() === url + "/api/drafts") drafts++;
  });
  await page.getByRole("button", { name: "Novo gasto" }).click();
  await page.getByRole("dialog", { name: "Novo gasto" })
    .getByRole("button", { name: "Preencher manualmente" }).click();
  const price = page.getByLabel("Valor (R$)", { exact: true });
  await price.fill("21,90");
  await page.getByLabel("Descrição").fill("Preenchimento inicial");

  const recordDraft = async () => {
    await page.getByRole("dialog", { name: "Novo gasto" })
      .getByRole("button", { name: "Registrar por voz" }).click();
    await page.getByRole("button", { name: "Gravar gasto" }).click();
    const stop = page.getByRole("button", { name: "Parar e interpretar" });
    await expect(stop).toBeEnabled();
    // Allow the fake recording device to supply audio frames before stopping.
    await page.waitForTimeout(450);
    await stop.click();
  };
  const decision = page.getByRole("dialog", { name: "Usar o rascunho da gravação?" });

  await recordDraft();
  const comparison = decision.getByRole("table", { name: "Comparação dos campos" });
  await expect(comparison.getByRole("columnheader", { name: "Preenchimento atual" })).toBeVisible();
  await expect(comparison.getByRole("columnheader", { name: "Rascunho de voz" })).toBeVisible();
  await expect(comparison.getByRole("row", { name: /Valor/ })).toContainText(/21,90.*42,90/);
  await expect(comparison.getByRole("row", { name: /Data/ })).toContainText("15/03/2026");
  await expect(comparison.getByRole("row", { name: /Descrição/ })).toContainText("Preenchimento inicial");
  await expect(comparison.getByRole("row", { name: /Descrição/ })).toContainText("Gasto por voz");
  await expect(comparison.getByRole("row", { name: /Categoria/ })).toContainText("Café");
  await expect(decision.getByRole("heading")).toBeFocused();
  expect(await decision.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const keep = decision.getByRole("button", { name: "Manter meu preenchimento" });
  await page.keyboard.press("Tab");
  await expect(keep).toBeFocused();
  await keep.click();
  await expect(price).toHaveValue("21,90");
  await expect(page.getByLabel("Descrição")).toHaveValue("Preenchimento inicial");

  await recordDraft();
  await decision.getByRole("button", { name: "Usar rascunho" }).click();
  await expect(page.getByRole("heading", { name: "Revisar rascunho" })).toBeFocused();
  await expect(price).toHaveValue("42,90");
  expect(drafts).toBe(2);
  expect(profiles.get(email).size).toBe(0);
  await page.getByRole("button", { name: "Descartar rascunho", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("compara o mês corrente por dias equivalentes e ignora meses futuros", async ({ page }) => {
  account = null;
  const email = "comparacao@example.test";
  const fixtures = [
    ["2026-02-01", 1000],
    ["2026-02-28", 2000],
    ["2026-03-28", 5000],
    ["2026-03-29", 7000],
    ["2026-04-01", 500],
  ];
  profiles.set(email, new Map(fixtures.map(([date, amount]) => [
    date, { id: date, date, description: "Gasto de teste", amount, category: "Casa" },
  ])));
  await page.clock.setFixedTime(new Date(2026, 2, 30, 12));
  await page.goto(url);
  await login(page, email);
  const comparison = page.locator(".previous-total");
  await expect(page.locator(".summary > strong")).toContainText("120,00");
  await expect(comparison).toContainText("Até o dia 28");
  await expect(comparison).toContainText("20,00");
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page.locator(".summary > strong")).toContainText("5,00");
  await expect(comparison).toHaveCount(0);
});

test("busca no histórico ignora acentos e mantém o texto original", async ({ page }) => {
  account = null;
  const email = "busca@example.test";
  profiles.set(email, new Map([
    ["1", { id: "1", date: "2026-03-15", description: "Passagem de ônibus", amount: 600, category: "Transporte" }],
    ["2", { id: "2", date: "2026-03-15", description: "Encomenda", amount: 2000, category: "Decoração" }],
  ]));
  await page.clock.setFixedTime(new Date(2026, 2, 15, 12));
  await page.goto(url + "/#historico");
  await login(page, email);
  const search = page.getByRole("searchbox", { name: "Buscar no histórico" });
  for (const query of ["onibus", "ônibus", " ONIBUS "]) {
    await search.fill(query);
    await expect(page.getByRole("heading", { name: "Passagem de ônibus" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Encomenda" })).toHaveCount(0);
  }
  await search.fill("decoracao");
  await expect(page.getByRole("heading", { name: "Encomenda" })).toBeVisible();
  await expect(page.getByText("Decoração", { exact: true })).toBeVisible();
});

test("o primeiro gasto pode ser preenchido direto no Início", async ({ page }) => {
  account = null;
  const email = "primeiro-gasto@example.test";
  await page.clock.setFixedTime(new Date(2026, 2, 15, 12));
  await page.goto(url);
  await login(page, email);
  const manual = page.getByRole("main").getByRole("button", { name: "Preencher manualmente" });
  await expect(manual).toBeEnabled();
  await manual.click();
  const editor = page.getByRole("dialog", { name: "Novo gasto" });
  const price = editor.getByLabel("Valor (R$)", { exact: true });
  await expect(price).toBeFocused();
  await price.fill("15,00");
  await editor.getByLabel("Descrição").fill("Gasto fictício do mês passado");
  await editor.getByLabel("Data", { exact: true }).fill("2026-02-28");
  await editor.getByLabel("Categoria", { exact: true }).fill("Casa");
  await editor.getByRole("button", { name: "Confirmar gasto" }).click();
  await expect(page.getByText("Gasto confirmado para 28 de fevereiro de 2026.")).toBeVisible();
  await expect(manual).toHaveCount(0);
  await expect(page.getByText("Sem gastos neste período.")).toBeVisible();
  await page.getByRole("button", { name: "Ver no Histórico" }).click();
  await expect(page).toHaveURL(/#historico$/);
  await expect(page.getByRole("heading", { name: "Gasto fictício do mês passado" })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Buscar no histórico" });
  await search.fill("sem resultado");
  await page.getByRole("button", { name: "Novo gasto" }).click();
  await page.getByRole("dialog", { name: "Novo gasto" })
    .getByRole("button", { name: "Preencher manualmente" }).click();
  await price.fill("18,00");
  await editor.getByLabel("Descrição").fill("Gasto fictício de outro dia");
  await editor.getByLabel("Categoria", { exact: true }).fill("Casa");
  await editor.getByRole("button", { name: "Confirmar gasto" }).click();
  await page.getByRole("button", { name: "Ver no Histórico" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Gasto fictício de outro dia" })).toBeVisible();
});

test("falha temporária no salvamento mantém campos e devolve o foco à tentativa", async ({ page }) => {
  account = null;
  const email = "repetir-salvamento@example.test";
  const requests = [];
  await page.route(url + "/api/expenses", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) return route.fulfill({ status: 503, json: {} });
    return route.continue();
  });
  await page.goto(url);
  await login(page, email);
  await page.getByRole("main").getByRole("button", { name: "Preencher manualmente" }).click();
  const editor = page.getByRole("dialog", { name: "Novo gasto" });
  const price = editor.getByLabel("Valor (R$)", { exact: true });
  await price.fill("21,90");
  await editor.getByLabel("Descrição").fill("Gasto fictício");
  await editor.getByLabel("Categoria", { exact: true }).fill("Casa");
  const save = editor.getByRole("button", { name: /Confirmar gasto|Tentar novamente/ });
  await save.click();

  const error = editor.getByRole("alert");
  await expect(error).toContainText(/salvar|salvamento/i);
  await expect(error).toContainText(/mantid|preservad/i);
  await expect(error).not.toContainText("Você pode digitar");
  await expect(price).toHaveValue("21,90");
  await expect(save).toBeFocused();
  expect(profiles.get(email).size).toBe(0);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Gasto fictício" })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(profiles.get(email).size).toBe(1);
});
