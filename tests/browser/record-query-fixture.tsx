import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { useRecordQuery } from "../../src/lib/use-record-query";

function Fixture() {
  const [record, setRecord] = useState("first");
  const { data, error } = useRecordQuery<{ name: string }>(`/records/${record}`);
  return <main>
    <h1>Record loading verification</h1>
    <button onClick={() => setRecord("slow")}>Slow record</button>{" "}
    <button onClick={() => setRecord("latest")}>Latest record</button>{" "}
    <button onClick={() => setRecord("failed")}>Failed record</button>
    <p>Selected: {record}</p>
    <p role="status">{error || data?.name || "Loading"}</p>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
