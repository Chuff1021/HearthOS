"use client";

import { useEffect, useState } from "react";

export type TenantSummary = {
  organization: {
    name: string;
    slug: string;
  };
  membership: {
    role: string;
  };
  identity: {
    email: string;
  };
};

export function useTenantSummary() {
  const [summary, setSummary] = useState<TenantSummary | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/tenant/current", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch(() => {
        if (active) setSummary(null);
      });
    return () => {
      active = false;
    };
  }, []);

  return summary;
}
