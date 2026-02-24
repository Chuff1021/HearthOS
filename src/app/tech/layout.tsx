"use client";

import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export default function TechLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${inter.className} min-h-screen bg-[#0f0f1a] text-white`}>
      {/* Mobile-optimized container */}
      <div className="max-w-md mx-auto min-h-screen flex flex-col">
        {children}
      </div>
    </div>
  );
}
