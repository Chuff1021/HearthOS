"use client";

import { useEffect } from "react";

export default function AutoPrint({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const timeoutId = window.setTimeout(() => {
      window.print();
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [enabled]);

  return null;
}
