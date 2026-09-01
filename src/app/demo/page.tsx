import type { Metadata } from "next";
import DemoLanding from "./DemoLanding";
import "./demo.css";

export const metadata: Metadata = {
  title: "HearthOS | Software Designed for Hearth Professionals",
  description:
    "The purpose-built operating system for hearth businesses, connecting showroom sales, projects, inventory, installation, service, and the field.",
};

export default function DemoPage() {
  return <DemoLanding />;
}
