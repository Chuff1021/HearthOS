import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import DashboardPage from "@/components/dashboard/DashboardPage";
import DemoLanding from "@/app/demo/DemoLanding";
import "./demo/demo.css";

export const metadata: Metadata = {
  title: "HearthOS | Software Designed for Hearth Professionals",
  description:
    "The purpose-built operating system for hearth businesses, connecting showroom sales, projects, inventory, installation, service, and the field.",
};

export default async function HomePage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <DashboardPage />;
  }

  const { userId } = await auth();
  return userId ? <DashboardPage /> : <DemoLanding />;
}
