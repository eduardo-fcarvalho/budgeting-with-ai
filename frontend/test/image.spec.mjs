import { test, expect } from "@playwright/test";

const url = process.env.BUDGETING_IMAGE_URL;
const loginPassword = "somente-teste-123";
test.skip(!url, "Requer a URL da imagem do piloto com o banco de teste.");

async function login(page, account) {
  // Playwright inclui o argumento de fill nos logs quando a ação falha.
  await page.getByLabel("E-mail").evaluate((field, value) => { field.value = value; }, `${account}@example.test`);
  await page.getByLabel("Senha").evaluate((field, value) => { field.value = value; }, loginPassword);
  await page.getByRole("button", { name: "Acessar meu diário" }).click();
}

async function confirmExpense(page, description, category) {
  await page.getByRole("button", { name: "Novo gasto" }).click();
  const editor = page.getByRole("dialog", { name: "Novo gasto" });
  await editor.getByRole("button", { name: "Preencher manualmente" }).click();
  await editor.getByLabel("Valor (R$)", { exact: true }).fill("23,45");
  await editor.getByLabel("Descrição").fill(description);
  await editor.getByLabel("Categoria", { exact: true }).fill(category);
  await editor.getByRole("button", { name: "Confirmar gasto" }).click();
  await expect(page.getByRole("heading", { name: description })).toBeVisible();
}

test("imagem do piloto persiste gastos e separa as contas no mesmo navegador", async ({ page, context }) => {
  await page.clock.setFixedTime(new Date(2026, 2, 15, 12));
  await page.goto(url);
  await login(page, "a");
  const description = "Passagem fictícia da primeira conta";
  const category = "Transporte de teste";
  await confirmExpense(page, description, category);

  await page.reload();
  const saved = page.getByRole("heading", { name: description });
  const row = page.getByRole("listitem").filter({ has: saved });
  await expect(row).toContainText(category);
  await expect(row).toContainText("23,45");
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(saved).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo gasto" })).toBeDisabled();
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();

  const logout = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/logout" && response.request().method() === "POST"
  );
  await context.setOffline(false);
  expect((await logout).status()).toBe(204);
  await page.goto(url);
  await login(page, "b");
  await expect(page.getByText("Nenhum gasto em", { exact: false })).toBeVisible();
  await expect(saved).toHaveCount(0);
  await confirmExpense(page, "Livro fictício da segunda conta", "Leitura de teste");
});
