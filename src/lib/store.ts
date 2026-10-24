import { getStore } from "@netlify/blobs";

// A tiny key-value store for meeting state. On Netlify it is backed by Netlify Blobs (strongly
// consistent, so a message written by one function instance is seen by the next poll on another).
// Anywhere else it is an in-memory map, which is right for `next start` and tests: one process.

export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keys under a prefix, in lexical order. */
  list(prefix: string): Promise<string[]>;
}

export function memoryStore(): KV {
  const data = new Map<string, string>();
  return {
    async get<T>(key: string) {
      const v = data.get(key);
      return v === undefined ? null : (JSON.parse(v) as T);
    },
    async set(key, value) {
      data.set(key, JSON.stringify(value));
    },
    async delete(key) {
      data.delete(key);
    },
    async list(prefix) {
      return [...data.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}

function blobStore(): KV {
  const store = getStore({ name: "convene", consistency: "strong" });
  return {
    async get<T>(key: string) {
      return ((await store.get(key, { type: "json" })) as T | null) ?? null;
    },
    async set(key, value) {
      await store.setJSON(key, value);
    },
    async delete(key) {
      await store.delete(key);
    },
    async list(prefix) {
      const { blobs } = await store.list({ prefix });
      return blobs.map((b) => b.key).sort();
    },
  };
}

declare global {
  var __conveneStore: KV | undefined;
  var netlifyBlobsContext: unknown;
}

/** The store for this process: Blobs when Netlify provides a context, memory otherwise. */
export function kv(): KV {
  if (globalThis.__conveneStore) return globalThis.__conveneStore;
  const onNetlify = Boolean(process.env.NETLIFY_BLOBS_CONTEXT || globalThis.netlifyBlobsContext);
  // Blobs context can arrive per request on Netlify, so only the memory store is cached.
  if (onNetlify) return blobStore();
  if (process.env.NETLIFY) throw new Error("Netlify Blobs is not available in this function; meetings need it on Netlify.");
  return (globalThis.__conveneStore = memoryStore());
}

/** Test helper: swap in a fresh store. */
export function setStoreForTests(store: KV) {
  globalThis.__conveneStore = store;
}
