"use client";

import { useEffect, useState } from "react";
import type { OrganizationFeatures } from "@/lib/tenant/features";

const unavailableFeatures: OrganizationFeatures = {
  meeksPortal: false,
  gabe: false,
  gabeAudit: false,
};

function loadFeatures() {
  return fetch("/api/tenant/current", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return unavailableFeatures;
      const data = await response.json();
      return { ...unavailableFeatures, ...(data.features || {}) };
    })
    .catch(() => unavailableFeatures);
}

export function useOrganizationFeatures() {
  const [features, setFeatures] = useState<OrganizationFeatures>(unavailableFeatures);

  useEffect(() => {
    let active = true;
    loadFeatures().then((nextFeatures) => {
      if (active) setFeatures(nextFeatures);
    });
    return () => {
      active = false;
    };
  }, []);

  return features;
}
