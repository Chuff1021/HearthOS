"use client";

export default function TechLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white font-sans">
      {/* Mobile-optimized container */}
      <div className="max-w-md mx-auto min-h-screen flex flex-col">
        {children}
      </div>
    </div>
  );
}
