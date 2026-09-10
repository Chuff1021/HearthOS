import React from "react";
import { createRoot } from "react-dom/client";
import ServiceReportEditor from "../../src/components/service-reports/ServiceReportEditor";
import TechJobPage from "../../src/app/tech/job/[jobId]/page";

// Only routing is synthetic. Both verification surfaces render production components.
const jobId = "22222222-2222-4222-8222-222222222222";
createRoot(document.getElementById("root")!).render(
  location.pathname.startsWith("/tech/job/") ? (
    <TechJobPage />
  ) : (
    <main className="min-h-screen p-4 sm:p-6">
      <ServiceReportEditor jobId={jobId} />
    </main>
  ),
);
