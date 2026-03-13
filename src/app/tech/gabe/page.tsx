"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GABEPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/tech");
  }, [router]);

  return null;
}
