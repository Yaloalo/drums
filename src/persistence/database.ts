import type { DrumKit, ExerciseAttempt, Pattern, SynthPreset } from '../model/types.ts';

const DB_NAME = 'pulse-foundry';
const DB_VERSION = 1;
const STORES = ['session', 'customPresets', 'customKits', 'customPatterns', 'attempts', 'settings'] as const;
type StoreName = (typeof STORES)[number];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => STORES.forEach((name) => {
      if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
    });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function dbGet<T>(store: StoreName, id: string): Promise<T | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).get(id);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function dbPut<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(store, 'readwrite').objectStore(store).put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export interface UserDataBundle {
  version: 1;
  exportedAt: string;
  customPresets: SynthPreset[];
  customKits: DrumKit[];
  customPatterns: Pattern[];
  attempts: ExerciseAttempt[];
  session?: Record<string, unknown>;
}

export async function exportUserData(): Promise<UserDataBundle> {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    customPresets: await dbGetAll('customPresets'),
    customKits: await dbGetAll('customKits'),
    customPatterns: await dbGetAll('customPatterns'),
    attempts: await dbGetAll('attempts'),
    session: await dbGet('session', 'current'),
  };
}

export function serializeUserData(bundle: UserDataBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function parseUserData(text: string): UserDataBundle {
  const value = JSON.parse(text) as Partial<UserDataBundle>;
  if (value.version !== 1 || !Array.isArray(value.customPresets) || !Array.isArray(value.customKits) || !Array.isArray(value.customPatterns) || !Array.isArray(value.attempts)) throw new Error('This is not a valid Pulse Foundry export.');
  return value as UserDataBundle;
}

export async function importUserData(bundle: UserDataBundle): Promise<void> {
  await Promise.all([
    ...bundle.customPresets.map((item) => dbPut('customPresets', item)),
    ...bundle.customKits.map((item) => dbPut('customKits', item)),
    ...bundle.customPatterns.map((item) => dbPut('customPatterns', item)),
    ...bundle.attempts.map((item) => dbPut('attempts', item)),
  ]);
  if (bundle.session) await dbPut('session', { id: 'current', ...bundle.session });
}
