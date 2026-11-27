import test from "node:test";
import assert from "node:assert/strict";
import { cents, periodRows, movePeriod, totals, localDate } from "../src/domain.ts";
import { encodeWav } from "../src/wav.ts";

test("valores em centavos sem arredondar centavos extras", () => {
  assert.equal(cents("42,90"), 4290);
  assert.equal(cents("0,01"), 1);
  assert.equal(cents("21.2"), 2120);
  assert.equal(cents("1.234,56"), 123456);
  assert.equal(cents(" R$\u00a01.234,56 "), 123456);
  assert.equal(cents("1.234"), 123400);
  assert.equal(cents("999.999.999,99"), 99999999999);
  for (const input of [
    "0", "-4", "3,004", "NaN", "", "1e4",
    "12.34,56", "1,234.56", "1.234,567", "1.000.000.000,00",
  ])
    assert.equal(cents(input), null);
});

test("datas locais e totais por categoria respeitam o mês", () => {
  assert.equal(localDate(new Date(2026, 0, 1, 23, 59)), "2026-01-01");
  const entries = [
    {
      description: "Pão",
      amount: 150,
      date: "2026-03-01",
      category: "Mercado",
    },
    {
      description: "Leite",
      amount: 390,
      date: "2026-03-04",
      category: "Mercado",
    },
    { description: "Chá", amount: 500, date: "2026-03-02", category: "Outros" },
    {
      description: "Maçã",
      amount: 280,
      date: "2026-04-01",
      category: "Mercado",
    },
  ];
  const rows = periodRows(entries, "month", "2026-03-15");
  assert.deepEqual(
    rows.map((x) => x.description),
    ["Leite", "Chá", "Pão"],
  );
  assert.deepEqual(totals(rows), [
    ["Mercado", 540],
    ["Outros", 500],
  ]);
});

test("períodos incluem suas extremidades e semanas começam na segunda", () => {
  const dates = ["2025-12-28", "2025-12-29", "2026-01-01", "2026-01-04", "2026-01-05"];
  const entries = dates.map((date) => ({ date }));
  const matchingDates = (period) =>
    periodRows(entries, period, "2026-01-01").map(({ date }) => date);

  assert.deepEqual(matchingDates("day"), ["2026-01-01"]);
  assert.deepEqual(matchingDates("week"), ["2026-01-04", "2026-01-01", "2025-12-29"]);
  assert.deepEqual(matchingDates("year"), ["2026-01-05", "2026-01-04", "2026-01-01"]);
  assert.equal(movePeriod("week", "2026-01-04", 1), "2026-01-05");
  assert.equal(movePeriod("month", "2026-01-31", 1), "2026-02-01");
  assert.equal(movePeriod("day", "2024-02-29", -1), "2024-02-28");
  assert.equal(movePeriod("year", "2024-02-29", 1), "2025-01-01");
  assert.equal(movePeriod("month", "9999-12-01", 1), "9999-12-01");
  assert.equal(movePeriod("day", "0001-01-01", -1), "0001-01-01");
  const lastDay = { date: "9999-12-31" };
  assert.deepEqual(periodRows([lastDay], "week", lastDay.date), [lastDay]);
});

test("WAV PCM mono tem duração limitada, taxa e tamanhos corretos", async () => {
  const blob = encodeWav(new Float32Array(48000 * 31).fill(0.5), 48000);
  const bytes = await blob.arrayBuffer();
  const v = new DataView(bytes);
  assert.equal(blob.type, "audio/wav");
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(v.getUint16(20, true), 1);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 30 * 16000 * 2);
  assert.equal(blob.size, 30 * 16000 * 2 + 44);
  assert.equal(v.getInt16(44, true), 16384);
});
