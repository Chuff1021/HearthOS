"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJobArray } from "./job-form-helpers";

// A failed refresh must not erase the last successful result or win a newer request.
export function useJobFormResource<T>(url: string, key: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchJobArray<T>(url, key, controller.signal);
      if (controller.signal.aborted) return;
      setData(next);
      setLoaded(true);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : `Could not load ${key}. Please try again.`);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [url, key]);

  useEffect(() => {
    void reload();
    return () => request.current?.abort();
  }, [reload]);

  return { data, setData, loading, loaded, error, reload };
}
