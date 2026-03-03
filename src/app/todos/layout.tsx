import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "To-Do List",
};

export default function TodosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
