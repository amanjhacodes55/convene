"use client";

import { useCallback, useEffect, useState } from "react";

/** JSON in, JSON out, and the server's error message thrown as an Error. */
export async function call<T = Record<string, unknown>>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? `Request failed (${res.status})`), { status: res.status });
  return json as T;
}

export type Me = { id: string; email: string; name: string; createdAt: number };

/** The signed-in account: undefined while loading, null when signed out. */
export function useMe() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    call<{ user: Me | null }>("/api/auth/me").then(
      (r) => setMe(r.user),
      () => setMe(null),
    );
  }, []);
  return me;
}

/** Loads a resource and reloads it on demand; `data` stays put while reloading. */
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    call<T>(path).then(
      (d) => live && (setData(d), setError("")),
      (e) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, reload, setData };
}
