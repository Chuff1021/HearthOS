import { auth } from "@clerk/nextjs/server";
import DashboardPage from "@/components/dashboard/DashboardPage";
import DemoLanding from "@/app/demo/DemoLanding";
import "./demo/demo.css";

export default async function HomePage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <DashboardPage />;
  }

  const { userId } = await auth();
  return userId ? <DashboardPage /> : <DemoLanding />;
}
