"use client";

import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export default function TechLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${inter.className} min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)]`}>
      {/* Mobile-optimized container */}
      <div className="max-w-md mx-auto min-h-screen flex flex-col">
        {children}
      </div>
    </div>
  );
}
