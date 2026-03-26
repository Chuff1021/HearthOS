"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TechBottomNav from "@/components/tech/TechBottomNav";

type Manual = {
  id: string;
  brand: string;
  model: string;
  type?: string | null;
  category?: string | null;
  url: string;
  pages?: number | null;
  createdAt?: string | null;
};

function normalize(v?: string | null) {
  return (v || "").trim().toLowerCase();
}

function deriveMake(manual: Manual) {
  const brand = (manual.brand || "").trim();
  const model = (manual.model || "").toLowerCase();

  const fromModel = (pairs: Array<[RegExp, string]>) => {
    for (const [re, name] of pairs) {
      if (re.test(model)) return name;
    }
    return null;
  };

  // HHT parent-brand normalization -> child brands
  if (!brand || /^hht\b|hht-shared$|hearth\s*&?\s*home/i.test(brand)) {
    const hht = fromModel([
      [/majestic/, "Majestic"],
      [/monessen/, "Monessen"],
      [/heatilator/, "Heatilator"],
      [/heat\s*&?\s*glo|heatnglo|heat-glo|heatglo/, "Heat & Glo"],
      [/quadra\s*-?\s*fire|quadrafire/, "Quadra-Fire"],
      [/simplicity|pelpro/, "PelPro"],
    ]);
    return hht ?? "HHT";
  }

  // Travis parent-brand normalization -> child brands
  if (/travis/i.test(brand)) {
    const travis = fromModel([
      [/fireplace\s*x|fireplacex|\bfpx\b/, "FireplaceX"],
      [/lopi/, "Lopi"],
      [/avalon/, "Avalon"],
    ]);
    return travis ?? "Travis Industries";
  }

  return brand;
}

function deriveModel(manual: Manual) {
  const raw = (manual.model || "").trim();
  if (!raw) return "Unknown Model";

  if (!/^hht\b|hht-shared$/i.test((manual.brand || "").trim())) {
    return raw;
  }

  const parts = raw.split("_").map((p) => p.trim()).filter(Boolean);
  const stop = new Set(["INSTALL", "OWNER", "MANUAL", "FC", "FR", "SP", "PDF"]);
  const keep = parts.filter((p) => !stop.has(p.toUpperCase()) && /[A-Z]/i.test(p));
  if (keep.length === 0) return raw;
  const modelLike = keep.slice(Math.max(0, keep.length - 2)).join(" ").replace(/%20/g, " ").trim();
  return modelLike || raw;
}

export default function ManualsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedBrand, setSelectedBrand] = useState("All Makes");
  const [selectedModel, setSelectedModel] = useState("All Models");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [inferredMakeById, setInferredMakeById] = useState<Record<string, string>>({});
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [lastIngestedId, setLastIngestedId] = useState<string | null>(null);
  const [ingestProgress, setIngestProgress] = useState<{ current: number; total: number } | null>(null);
  const [ingestStatus, setIngestStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    brand: "",
    model: "",
    type: "",
    category: "",
    url: "",
    pages: "",
  });

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [manualsRes, sectionsRes] = await Promise.all([
          fetch("/api/manuals"),
          fetch("/api/manuals/sections"),
        ]);
        const data = (await manualsRes.json()) as { manuals: Manual[] };
        const sectionsData = (await sectionsRes.json()) as { sections?: Array<{ manualId: string; title?: string | null; snippet?: string | null }> };
        const list = Array.isArray(data.manuals) ? data.manuals : [];

        const inferred: Record<string, string> = {};
        for (const section of sectionsData.sections ?? []) {
          const text = `${section.title ?? ""} ${section.snippet ?? ""}`.toLowerCase();
          if (!text) continue;
          if (!inferred[section.manualId]) {
            if (text.includes("majestic")) inferred[section.manualId] = "Majestic";
            else if (text.includes("monessen")) inferred[section.manualId] = "Monessen";
            else if (text.includes("heatilator")) inferred[section.manualId] = "Heatilator";
            else if (text.includes("heat & glo") || text.includes("heatnglo") || text.includes("heat n glo") || text.includes("heat-glo") || text.includes("heatglo")) inferred[section.manualId] = "Heat & Glo";
            else if (text.includes("quadra-fire") || text.includes("quadrafire")) inferred[section.manualId] = "Quadra-Fire";
          }
        }
        setInferredMakeById(inferred);

        list.sort((a, b) => {
          const brandCmp = (a.brand || "").localeCompare(b.brand || "", undefined, { sensitivity: "base" });
          if (brandCmp !== 0) return brandCmp;
          return (a.model || "").localeCompare(b.model || "", undefined, { sensitivity: "base" });
        });
        setManuals(list);
      } catch {
        setManuals([]);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const manualMake = (manual: Manual) => inferredMakeById[manual.id] ?? deriveMake(manual);

  const categories = useMemo(
    () => [
      "All",
      ...Array.from(new Set(manuals.map((m) => m.category).filter((c): c is string => Boolean(c)))).sort((a, b) => a.localeCompare(b)),
    ],
    [manuals]
  );

  const brands = useMemo(
    () => [
      "All Makes",
      ...Array.from(new Set(manuals.map((m) => manualMake(m)).filter((b): b is string => Boolean(b)))).sort((a, b) => a.localeCompare(b)),
    ],
    [manuals, inferredMakeById]
  );

  const models = useMemo(() => {
    const source = manuals.filter((m) => selectedBrand === "All Makes" || manualMake(m) === selectedBrand);
    return [
      "All Models",
      ...Array.from(new Set(source.map((m) => deriveModel(m)).filter((m): m is string => Boolean(m)))).sort((a, b) => a.localeCompare(b)),
    ];
  }, [manuals, selectedBrand, inferredMakeById]);

  useEffect(() => {
    if (selectedModel !== "All Models" && !models.includes(selectedModel)) {
      setSelectedModel("All Models");
    }
  }, [selectedBrand, selectedModel, models]);

  const filteredManuals = useMemo(
    () =>
      manuals.filter((manual) => {
        const q = normalize(searchQuery);
        const matchesSearch =
          !q ||
          normalize(manualMake(manual)).includes(q) ||
          normalize(deriveModel(manual)).includes(q) ||
          normalize(manual.type).includes(q) ||
          normalize(manual.category).includes(q);
        const matchesCategory = selectedCategory === "All" || manual.category === selectedCategory;
        const matchesBrand = selectedBrand === "All Makes" || manualMake(manual) === selectedBrand;
        const matchesModel = selectedModel === "All Models" || deriveModel(manual) === selectedModel;
        return matchesSearch && matchesCategory && matchesBrand && matchesModel;
      }),
    [manuals, searchQuery, selectedCategory, selectedBrand, selectedModel, inferredMakeById]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Manual[]>();
    for (const manual of filteredManuals) {
      const brand = manualMake(manual) || "Unknown";
      if (!map.has(brand)) map.set(brand, []);
      map.get(brand)!.push(manual);
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
      .map(([brand, rows]) => ({
        brand,
        manuals: rows.sort((a, b) => deriveModel(a).localeCompare(deriveModel(b), undefined, { sensitivity: "base" })),
      }));
  }, [filteredManuals]);

  const handleSubmit = async () => {
    setFormError(null);
    if (!formState.brand || !formState.model || !formState.url) {
      setFormError("Brand, model, and manual URL are required.");
      return;
    }

    try {
      const res = await fetch("/api/manuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: formState.brand,
          model: formState.model,
          type: formState.type || undefined,
          category: formState.category || undefined,
          url: formState.url,
          pages: formState.pages ? Number(formState.pages) : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data?.error || "Failed to add manual.");
        return;
      }

      const data = (await res.json()) as { manual: Manual };
      setManuals((prev) => [...prev, data.manual]);
      setShowUploadModal(false);
      setFormState({ brand: "", model: "", type: "", category: "", url: "", pages: "" });
    } catch {
      setFormError("Failed to add manual.");
    }
  };

  async function ingestManual(manual: Manual) {
    if (ingestingId) return;
    setIngestingId(manual.id);
    setIngestProgress(null);
    setIngestStatus("Loading PDF...");

    try {
      // Dynamically import pdfjs-dist
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      // Fetch and load the PDF
      const pdf = await pdfjsLib.getDocument({
        url: manual.url,
        disableAutoFetch: true,
        disableStream: true,
      }).promise;

      const totalPages = pdf.numPages;
      setIngestProgress({ current: 0, total: totalPages });
      setIngestStatus(`Processing 0 / ${totalPages} pages...`);

      let successCount = 0;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        setIngestProgress({ current: pageNum, total: totalPages });
        setIngestStatus(`Processing page ${pageNum} / ${totalPages}...`);

        try {
          const page = await pdf.getPage(pageNum);
          const scale = 2.0; // ~200 DPI for letter-size
          const viewport = page.getViewport({ scale });

          // Render page to canvas
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

          // Convert to base64 PNG (strip the data:image/png;base64, prefix)
          const dataUrl = canvas.toDataURL("image/png", 0.85);
          const imageBase64 = dataUrl.replace(/^data:image\/png;base64,/, "");

          // Send to ingestion API
          const res = await fetch("/api/manuals/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              manualId: manual.id,
              pageNumber: pageNum,
              imageBase64,
            }),
          });

          if (res.ok) {
            successCount++;
          } else {
            const err = await res.json().catch(() => ({}));
            console.warn(`Page ${pageNum} ingestion failed:`, err);
          }

          // Clean up canvas
          canvas.width = 0;
          canvas.height = 0;
        } catch (pageErr) {
          console.warn(`Failed to process page ${pageNum}:`, pageErr);
        }
      }

      setIngestStatus(`Done! ${successCount} / ${totalPages} pages ingested for GABE AI.`);
      setLastIngestedId(manual.id);
    } catch (err) {
      console.error("Ingestion failed:", err);
      setIngestStatus(`Failed: ${err instanceof Error ? err.message : "Could not process PDF"}`);
      setLastIngestedId(manual.id);
    } finally {
      setIngestingId(null);
      setIngestProgress(null);
    }
  }

  return (
    <div className="ui-page-mobile flex flex-col min-h-screen pb-32">
      <header
        className="ui-mobile-header sticky top-0 z-10 px-4 pb-4"
        style={{ paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold">Manuals Library</h1>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Organized by make and model</p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="ui-btn-primary px-3 py-1.5 rounded-lg text-sm font-medium"
          >
            + Upload
          </button>
        </div>

        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 " fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search make, model, type, category..."
            className="w-full ui-input w-full rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none"
          />
        </div>
      </header>

      <div className="ui-mobile-header border-b overflow-x-auto" style={{ top: "calc(env(safe-area-inset-top) + 88px)" }}>
        <div className="px-4 py-2 space-y-2">
          <div className="flex gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  selectedCategory === category ? "bg-orange-500 text-white" : "ui-card-muted"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {brands.map((brand) => (
              <button
                key={brand}
                onClick={() => setSelectedBrand(brand)}
                className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                  selectedBrand === brand ? "bg-blue-500 text-white" : "ui-card-muted"
                }`}
              >
                {brand}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {models.slice(0, 20).map((model) => (
              <button
                key={model}
                onClick={() => setSelectedModel(model)}
                className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                  selectedModel === model ? "bg-emerald-500 text-white" : "ui-card-muted"
                }`}
              >
                {model}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        {isLoading ? (
          <div className="text-center py-12 ">Loading manuals...</div>
        ) : grouped.length > 0 ? (
          <div className="space-y-6">
            {grouped.map((group) => (
              <section key={group.brand}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-orange-300">{group.brand}</h2>
                  <span className="text-xs ">{group.manuals.length} model{group.manuals.length === 1 ? "" : "s"}</span>
                </div>
                <div className="space-y-3">
                  {group.manuals.map((manual) => (
                    <div key={manual.id} className="ui-card rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zm-3 9h4v2h-4v-2zm0 4h4v2h-4v-2zm6-4h2v6h-2v-6z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold leading-tight">{deriveModel(manual)}</h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
                            <span className="px-2 py-0.5 rounded-full border border-blue-200 bg-blue-100 text-blue-900">{manualMake(manual)}</span>
                            {manual.type ? <span className="px-2 py-0.5 rounded-full border" style={{ background: "var(--color-surface-3)", color: "var(--color-text-secondary)", borderColor: "var(--color-border)" }}>{manual.type}</span> : null}
                            <span className="">{manual.pages ? `${manual.pages} pages` : "pages n/a"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-3">
                        <a
                          href={manual.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 ui-btn-secondary py-2 rounded-lg text-sm font-medium transition-colors text-center"
                        >
                          View PDF
                        </a>
                        <button
                          onClick={() => ingestManual(manual)}
                          disabled={!!ingestingId}
                          className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                          style={{
                            background: ingestingId === manual.id ? "rgba(245,158,11,0.15)" : "rgba(37,99,235,0.12)",
                            color: ingestingId === manual.id ? "#F59E0B" : "#2563EB",
                            border: `1px solid ${ingestingId === manual.id ? "rgba(245,158,11,0.3)" : "rgba(37,99,235,0.25)"}`,
                          }}
                        >
                          {ingestingId === manual.id ? `${ingestProgress?.current || 0}/${ingestProgress?.total || "?"}` : "Ingest for AI"}
                        </button>
                      </div>
                      {(ingestingId === manual.id || lastIngestedId === manual.id) && ingestStatus && (
                        <div className="mt-2">
                          {ingestProgress && (
                            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-surface-3)" }}>
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${Math.round((ingestProgress.current / ingestProgress.total) * 100)}%`,
                                  background: "linear-gradient(90deg, #2563EB, #F59E0B)",
                                }}
                              />
                            </div>
                          )}
                          <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{ingestStatus}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto  mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="">No manuals found</p>
            <p className="text-sm  mt-1">Try a different search or category</p>
          </div>
        )}
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end">
          <div className="ui-card w-full max-w-md mx-auto rounded-t-2xl p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Upload Manual</h3>
              <button onClick={() => setShowUploadModal(false)} className="">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <input type="text" placeholder="Brand (make)" value={formState.brand} onChange={(e) => setFormState((prev) => ({ ...prev, brand: e.target.value }))} className="w-full ui-input w-full rounded-xl px-4 py-3 text-sm outline-none" />
              <input type="text" placeholder="Model" value={formState.model} onChange={(e) => setFormState((prev) => ({ ...prev, model: e.target.value }))} className="w-full ui-input w-full rounded-xl px-4 py-3 text-sm outline-none" />
              <input type="text" placeholder="Type (optional)" value={formState.type} onChange={(e) => setFormState((prev) => ({ ...prev, type: e.target.value }))} className="w-full ui-input w-full rounded-xl px-4 py-3 text-sm outline-none" />
              <input type="text" placeholder="Category (optional)" value={formState.category} onChange={(e) => setFormState((prev) => ({ ...prev, category: e.target.value }))} className="w-full ui-input w-full rounded-xl px-4 py-3 text-sm outline-none" />
              <input type="text" placeholder="Manual URL" value={formState.url} onChange={(e) => setFormState((prev) => ({ ...prev, url: e.target.value }))} className="w-full ui-input w-full rounded-xl px-4 py-3 text-sm outline-none" />
              <input type="number" placeholder="Pages (optional)" value={formState.pages} onChange={(e) => setFormState((prev) => ({ ...prev, pages: e.target.value }))} className="w-full ui-input w-full rounded-xl px-4 py-3 text-sm outline-none" />
            </div>

            {formError && <p className="text-sm text-red-400 mt-3">{formError}</p>}

            <button onClick={handleSubmit} className="w-full ui-btn-primary py-3 rounded-xl font-medium mt-4">
              Upload Manual
            </button>
          </div>
        </div>
      )}

      <TechBottomNav active="manuals" />
    </div>
  );
}
