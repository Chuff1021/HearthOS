"use client";

import { useEffect, useState } from "react";
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

export default function ManualsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [manuals, setManuals] = useState<Manual[]>([]);
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
        const res = await fetch("/api/manuals");
        const data = await res.json() as { manuals: Manual[] };
        setManuals(Array.isArray(data.manuals) ? data.manuals : []);
      } catch {
        setManuals([]);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const categories = [
    "All",
    ...Array.from(new Set(manuals.map((m) => m.category).filter((c): c is string => Boolean(c)))),
  ];

  const filteredManuals = manuals.filter((manual) => {
    const matchesSearch =
      manual.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manual.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (manual.type || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || manual.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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

      const data = await res.json() as { manual: Manual };
      setManuals((prev) => [data.manual, ...prev]);
      setShowUploadModal(false);
      setFormState({ brand: "", model: "", type: "", category: "", url: "", pages: "" });
    } catch {
      setFormError("Failed to add manual.");
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Header */}
      <header className="bg-[var(--color-surface-1)] p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold">Manuals Library</h1>
          <button
            onClick={() => setShowUploadModal(true)}
            className="bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1.5 rounded-lg text-sm font-medium"
          >
            + Upload
          </button>
        </div>
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by brand, model, or type..."
            className="w-full bg-[var(--color-surface-3)] rounded-xl pl-10 pr-4 py-2.5 text-sm border border-gray-700 focus:border-blue-600 outline-none"
          />
        </div>
      </header>

      {/* Category Tabs */}
      <div className="bg-[var(--color-surface-1)] border-b border-gray-800 overflow-x-auto">
        <div className="flex gap-2 px-4 py-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                selectedCategory === category
                  ? "bg-blue-600 text-white"
                  : "bg-[var(--color-surface-3)] text-gray-400"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Manuals List */}
      <div className="flex-1 p-4">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading manuals...</div>
        ) : filteredManuals.length > 0 ? (
          <div className="space-y-3">
            {filteredManuals.map((manual) => (
              <div
                key={manual.id}
                className="bg-[var(--color-surface-1)] rounded-xl p-4 border border-gray-800"
              >
                <div className="flex items-start gap-3">
                  {/* PDF Icon */}
                  <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zm-3 9h4v2h-4v-2zm0 4h4v2h-4v-2zm6-4h2v6h-2v-6z" />
                    </svg>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">
                      {manual.brand} {manual.model}
                    </h3>
                    <p className="text-sm text-gray-400">{manual.type}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      {manual.pages ? <span>{manual.pages} pages</span> : <span>Pages: n/a</span>}
                    </div>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <a
                    href={manual.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 bg-[var(--color-surface-3)] py-2 rounded-lg text-sm font-medium hover:bg-[#2f2f4a] transition-colors text-center"
                  >
                    View PDF
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(manual.url);
                    }}
                    className="flex-1 bg-blue-600/20 text-blue-600 py-2 rounded-lg text-sm font-medium hover:bg-blue-600/30 transition-colors text-center"
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-400">No manuals found</p>
            <p className="text-sm text-gray-500 mt-1">Try a different search or category</p>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end">
          <div className="bg-[var(--color-surface-1)] w-full max-w-md mx-auto rounded-t-2xl p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Upload Manual</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Upload Area */}
            <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center mb-4">
              <svg className="w-12 h-12 mx-auto text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-400 mb-2">Paste a manual URL (PDF or hosted doc)</p>
              <p className="text-xs text-gray-500">Files are stored externally; we save links + metadata.</p>
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Brand (e.g., Regency)"
                value={formState.brand}
                onChange={(e) => setFormState((prev) => ({ ...prev, brand: e.target.value }))}
                className="w-full bg-[var(--color-surface-3)] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-blue-600 outline-none"
              />
              <input
                type="text"
                placeholder="Model (e.g., F1100)"
                value={formState.model}
                onChange={(e) => setFormState((prev) => ({ ...prev, model: e.target.value }))}
                className="w-full bg-[var(--color-surface-3)] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-blue-600 outline-none"
              />
              <input
                type="text"
                placeholder="Type (e.g., Gas Insert)"
                value={formState.type}
                onChange={(e) => setFormState((prev) => ({ ...prev, type: e.target.value }))}
                className="w-full bg-[var(--color-surface-3)] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-blue-600 outline-none"
              />
              <input
                type="text"
                placeholder="Category (e.g., Gas Inserts)"
                value={formState.category}
                onChange={(e) => setFormState((prev) => ({ ...prev, category: e.target.value }))}
                className="w-full bg-[var(--color-surface-3)] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-blue-600 outline-none"
              />
              <input
                type="text"
                placeholder="Manual URL (PDF link)"
                value={formState.url}
                onChange={(e) => setFormState((prev) => ({ ...prev, url: e.target.value }))}
                className="w-full bg-[var(--color-surface-3)] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-blue-600 outline-none"
              />
              <input
                type="number"
                placeholder="Pages (optional)"
                value={formState.pages}
                onChange={(e) => setFormState((prev) => ({ ...prev, pages: e.target.value }))}
                className="w-full bg-[var(--color-surface-3)] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-blue-600 outline-none"
              />
            </div>

            {formError && <p className="text-sm text-red-400 mt-3">{formError}</p>}

            <button
              onClick={handleSubmit}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 py-3 rounded-xl font-medium mt-4"
            >
              Upload Manual
            </button>
          </div>
        </div>
      )}

      <TechBottomNav active="manuals" />
    </div>
  );
}
