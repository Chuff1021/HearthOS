"use client";

import { useState } from "react";
import Link from "next/link";

// Mock manuals data
const mockManuals = [
  {
    id: "1",
    brand: "Regency",
    model: "F1100",
    type: "Gas Insert",
    fileName: "Regency_F1100_Manual.pdf",
    pages: 48,
    uploadDate: "2025-01-15",
    category: "Gas Inserts",
  },
  {
    id: "2",
    brand: "Napoleon",
    model: "AS35",
    type: "Gas Stove",
    fileName: "Napoleon_AS35_Manual.pdf",
    pages: 36,
    uploadDate: "2025-01-10",
    category: "Gas Stoves",
  },
  {
    id: "3",
    brand: "Heat & Glo",
    model: "SLR",
    type: "Gas Fireplace",
    fileName: "HeatGlo_SLR_Manual.pdf",
    pages: 52,
    uploadDate: "2025-01-08",
    category: "Gas Fireplaces",
  },
  {
    id: "4",
    brand: "Vermont Castings",
    model: "Defiant",
    type: "Wood Stove",
    fileName: "VC_Defiant_Manual.pdf",
    pages: 44,
    uploadDate: "2024-12-20",
    category: "Wood Stoves",
  },
  {
    id: "5",
    brand: "Dimplex",
    model: "Opti-Myst",
    type: "Electric Fireplace",
    fileName: "Dimplex_OptiMyst_Manual.pdf",
    pages: 28,
    uploadDate: "2024-12-15",
    category: "Electric",
  },
  {
    id: "6",
    brand: "Majestic",
    model: "Ruby 36",
    type: "Gas Fireplace",
    fileName: "Majestic_Ruby36_Manual.pdf",
    pages: 40,
    uploadDate: "2024-12-10",
    category: "Gas Fireplaces",
  },
];

const categories = ["All", "Gas Fireplaces", "Gas Inserts", "Gas Stoves", "Wood Stoves", "Electric"];

export default function ManualsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showUploadModal, setShowUploadModal] = useState(false);

  const filteredManuals = mockManuals.filter((manual) => {
    const matchesSearch =
      manual.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manual.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manual.type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || manual.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Header */}
      <header className="bg-[#1a1a2e] p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold">Manuals Library</h1>
          <button
            onClick={() => setShowUploadModal(true)}
            className="bg-gradient-to-r from-orange-500 to-amber-500 px-3 py-1.5 rounded-lg text-sm font-medium"
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
            className="w-full bg-[#252540] rounded-xl pl-10 pr-4 py-2.5 text-sm border border-gray-700 focus:border-orange-500 outline-none"
          />
        </div>
      </header>

      {/* Category Tabs */}
      <div className="bg-[#1a1a2e] border-b border-gray-800 overflow-x-auto">
        <div className="flex gap-2 px-4 py-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                selectedCategory === category
                  ? "bg-orange-500 text-white"
                  : "bg-[#252540] text-gray-400"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Manuals List */}
      <div className="flex-1 p-4">
        {filteredManuals.length > 0 ? (
          <div className="space-y-3">
            {filteredManuals.map((manual) => (
              <div
                key={manual.id}
                className="bg-[#1a1a2e] rounded-xl p-4 border border-gray-800"
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
                      <span>{manual.pages} pages</span>
                      <span>•</span>
                      <span>{manual.uploadDate}</span>
                    </div>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <button className="flex-1 bg-[#252540] py-2 rounded-lg text-sm font-medium hover:bg-[#2f2f4a] transition-colors">
                    View PDF
                  </button>
                  <button className="flex-1 bg-orange-500/20 text-orange-400 py-2 rounded-lg text-sm font-medium hover:bg-orange-500/30 transition-colors">
                    Download
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
          <div className="bg-[#1a1a2e] w-full max-w-md mx-auto rounded-t-2xl p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Upload Manual</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Upload Area */}
            <div className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center mb-4">
              <svg className="w-12 h-12 mx-auto text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-400 mb-2">Tap to select a PDF file</p>
              <p className="text-xs text-gray-500">Max file size: 50MB</p>
              <input type="file" accept=".pdf" className="absolute inset-0 opacity-0 cursor-pointer" />
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Brand (e.g., Regency)"
                className="w-full bg-[#252540] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-orange-500 outline-none"
              />
              <input
                type="text"
                placeholder="Model (e.g., F1100)"
                className="w-full bg-[#252540] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-orange-500 outline-none"
              />
              <select className="w-full bg-[#252540] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-orange-500 outline-none text-gray-400">
                <option value="">Select Category</option>
                {categories.filter(c => c !== "All").map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <button className="w-full bg-gradient-to-r from-orange-500 to-amber-500 py-3 rounded-xl font-medium mt-4">
              Upload Manual
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#1a1a2e] border-t border-gray-800 z-20">
        <div className="max-w-md mx-auto flex justify-around py-3">
          <Link href="/tech" className="flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs mt-1">Jobs</span>
          </Link>
          <Link href="/tech/manuals" className="flex flex-col items-center text-orange-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-xs mt-1">Manuals</span>
          </Link>
          <Link href="/tech/gabe" className="flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-xs mt-1">GABE</span>
          </Link>
          <Link href="/tech/profile" className="flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs mt-1">Profile</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
