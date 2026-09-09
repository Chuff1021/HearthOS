"use client";

import { useEffect, useState } from "react";
import { fetchDashboardData, type DashboardSource } from "./dashboard-data";

export type DashboardResource<T> = {
  data: T | null;
  status: "loading" | "ready" | "error";
  retry: () => void;
};

export function useDashboardResource<T>(source: DashboardSource, url: string): DashboardResource<T> {
  const [attempt, setAttempt] = useState(0);
  const key = `${source}:${url}`;
  const [result, setResult] = useState<{ key: string; data: T | null; status: DashboardResource<T>["status"] }>({ key, data: null, status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      setResult({ key, data: null, status: "error" });
    }, 15_000);

    fetchDashboardData<T>(source, url, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setResult({ key, data, status: "ready" }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ key, data: null, status: "error" }); })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [source, url, key, attempt]);

  const current = result.key === key ? result : { data: null, status: "loading" as const };
  return { ...current, retry: () => {
    setResult({ key, data: null, status: "loading" });
    setAttempt((value) => value + 1);
  } };
}
