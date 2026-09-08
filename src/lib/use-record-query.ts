"use client";

import { useEffect, useState } from "react";

export function useRecordQuery<T>(url: string) {
  const [result, setResult] = useState<{ url: string; data: T | null; error: string | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load record");
        if (active) setResult({ url, data, error: null });
      } catch (error) {
        if (active) setResult({ url, data: null, error: error instanceof Error ? error.message : "Failed to load record" });
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [url]);
  return result?.url === url ? result : { data: null, error: null };
}
