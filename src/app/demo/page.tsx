import type { Metadata } from "next";
import DemoLanding from "./DemoLanding";
import "./demo.css";

export const metadata: Metadata = {
  title: "HearthOS | The Operating System for Fireplace Dealers",
  description:
    "Run your fireplace dealership from one connected system for sales, service, dispatch, inventory, projects, payments, and field teams.",
};

export default function DemoPage() {
  return <DemoLanding />;
}
