import type { Snapshot } from "./domain";
export const markerKey = "budgeting.account.v1";
export type Marker = { user: string; epoch: string; pending: boolean };

export function current(): Marker | null {
  const value = localStorage.getItem(markerKey);
  return value ? JSON.parse(value) : null;
}
export function same(left: Marker | null, right: Marker | null): boolean {
  return (
    left?.epoch === right?.epoch &&
    left?.user === right?.user &&
    left?.pending === right?.pending
  );
}
export function assertCurrent(marker: Marker | null) {
  if (!same(current(), marker))
    throw new Error("A conta mudou. Atualize a página.");
}

let database: Promise<IDBDatabase> | undefined;
function db() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("budgeting-history", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("history");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const connection = await db();
  return new Promise((resolve, reject) => {
    const tx = connection.transaction("history", mode);
    const operation = run(tx.objectStore("history"));
    tx.oncomplete = () => resolve(operation.result);
    tx.onabort = () => reject(tx.error || operation.error);
    tx.onerror = () => reject(tx.error || operation.error);
  });
}
export async function snapshot(marker: Marker): Promise<Snapshot | undefined> {
  if (marker.pending) return;
  assertCurrent(marker);
  const value = await transaction("readonly", (store) =>
    store.get(marker.epoch),
  );
  assertCurrent(marker);
  return value;
}
export async function saveSnapshot(marker: Marker, value: Snapshot) {
  await transaction("readwrite", (store) => {
    assertCurrent(marker);
    if (marker.pending) throw new Error("Sessão encerrada.");
    return store.put(value, marker.epoch);
  });
}
export function revoke(marker: Marker): Marker {
  assertCurrent(marker);
  const revoked = { ...marker, pending: true };
  localStorage.setItem(markerKey, JSON.stringify(revoked));
  return revoked;
}

export async function forgetSnapshot(marker: Marker) {
  await transaction("readwrite", (store) => store.delete(marker.epoch));
}

export async function change(marker: Marker | null, user: string | null) {
  assertCurrent(marker);
  if (marker) {
    const revoked = revoke(marker);
    await forgetSnapshot(marker);
    assertCurrent(revoked);
  }
  const next = user
    ? { user, pending: false, epoch: crypto.randomUUID() }
    : null;
  if (next) localStorage.setItem(markerKey, JSON.stringify(next));
  else localStorage.removeItem(markerKey);
  return next;
}
