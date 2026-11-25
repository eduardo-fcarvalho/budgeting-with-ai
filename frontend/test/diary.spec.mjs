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
    const path = req.url;
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

test("consulta offline e logout eliminam o histórico em todas as abas", async ({
  page,
  context,
}) => {
  async function login(email) {
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill("somente-teste");
    await page.getByRole("button", { name: "Acessar meu diário" }).click();
    await expect(
      page.getByRole("button", { name: "Novo gasto" }),
    ).toBeEnabled();
  }
  await page.goto(url);
  await login("a@example.test");
  await page.getByRole("button", { name: "Novo gasto" }).click();
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
  await login("b@example.test");
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
  await page.getByLabel("E-mail").fill("voz@example.test");
  await page.getByLabel("Senha").fill("somente-teste");
  await page.getByRole("button", { name: "Acessar meu diário" }).click();
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
