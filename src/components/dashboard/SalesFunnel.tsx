"use client";

import { useState } from "react";

// Stable reference time for "days until" calculations (module-level, not in render)
const NOW_MS = new Date().getTime();

type ProjectStage = "lead" | "quoted" | "approved" | "ordered" | "scheduled" | "installed";
type OrderStatus = "pending" | "ordered" | "in_transit" | "arrived" | "delayed";

interface ProjectProduct {
  name: string;
  sku: string;
  orderStatus: OrderStatus;
  orderedDate?: string;
  etaDate?: string;
  arrivedDate?: string;
  vendor: string;
  cost: number;
}

interface Project {
  id: string;
  customer: string;
  address: string;
  stage: ProjectStage;
  value: number;
  fireplace: string;
  assignedTech?: string;
  scheduledDate?: string;
  createdDate: string;
  lastUpdated: string;
  notes?: string;
  products: ProjectProduct[];
  priority: "high" | "normal" | "low";
}

const mockProjects: Project[] = [
  {
    id: "P001",
    customer: "Williams Residence",
    address: "456 Maple Ave, Springfield, IL",
    stage: "ordered",
    value: 4850,
    fireplace: "Napoleon GX70 Linear Gas Fireplace",
    assignedTech: "Mike R.",
    scheduledDate: "2026-03-08",
    createdDate: "2026-02-10",
    lastUpdated: "2026-02-22",
    notes: "Customer wants installation before spring. Confirm gas line size on site visit.",
    priority: "high",
    products: [
      {
        name: "Napoleon GX70 Linear Gas Fireplace",
        sku: "GX70NTE",
        orderStatus: "in_transit",
        orderedDate: "2026-02-15",
        etaDate: "2026-03-05",
        vendor: "Napoleon Direct",
        cost: 3200,
      },
      {
        name: "4\" Co-Axial Vent Kit (10 ft)",
        sku: "W175-0743",
        orderStatus: "arrived",
        orderedDate: "2026-02-15",
        arrivedDate: "2026-02-20",
        vendor: "Napoleon Direct",
        cost: 185,
      },
      {
        name: "Remote Control Kit",
        sku: "W010-3985",
        orderStatus: "arrived",
        orderedDate: "2026-02-15",
        arrivedDate: "2026-02-20",
        vendor: "Napoleon Direct",
        cost: 95,
      },
    ],
  },
  {
    id: "P002",
    customer: "Thompson New Build",
    address: "789 Oak Drive, Chatham, IL",
    stage: "approved",
    value: 7200,
    fireplace: "Regency Grandview G600C Gas Fireplace",
    assignedTech: "Sarah K.",
    scheduledDate: "2026-03-15",
    createdDate: "2026-02-05",
    lastUpdated: "2026-02-21",
    notes: "New construction — coordinate with GC for rough-in. Builder wants unit on site by March 12.",
    priority: "high",
    products: [
      {
        name: "Regency Grandview G600C",
        sku: "G600CENG",
        orderStatus: "ordered",
        orderedDate: "2026-02-21",
        etaDate: "2026-03-10",
        vendor: "Regency Distributor",
        cost: 4800,
      },
      {
        name: "6\" Direct Vent Liner Kit",
        sku: "DVL-6-20",
        orderStatus: "pending",
        vendor: "Hearth Supply Co.",
        cost: 320,
      },
      {
        name: "Surround Kit — Brushed Nickel",
        sku: "G600-SRD-BN",
        orderStatus: "pending",
        vendor: "Regency Distributor",
        cost: 450,
      },
    ],
  },
  {
    id: "P003",
    customer: "Martinez Residence",
    address: "321 Pine St, Rochester, IL",
    stage: "scheduled",
    value: 2400,
    fireplace: "Heat & Glo 6000CLX Gas Insert",
    assignedTech: "Dave T.",
    scheduledDate: "2026-02-28",
    createdDate: "2026-01-28",
    lastUpdated: "2026-02-23",
    notes: "Replacing old wood-burning insert. All products arrived. Ready to install.",
    priority: "normal",
    products: [
      {
        name: "Heat & Glo 6000CLX Gas Insert",
        sku: "6000CLX-IFT",
        orderStatus: "arrived",
        orderedDate: "2026-02-01",
        arrivedDate: "2026-02-18",
        vendor: "Hearth & Home Supply",
        cost: 1650,
      },
      {
        name: "Flex Liner Kit 4\" × 25 ft",
        sku: "FL-4-25SS",
        orderStatus: "arrived",
        orderedDate: "2026-02-01",
        arrivedDate: "2026-02-18",
        vendor: "Hearth & Home Supply",
        cost: 285,
      },
    ],
  },
  {
    id: "P004",
    customer: "Anderson Residence",
    address: "654 Elm Blvd, Springfield, IL",
    stage: "quoted",
    value: 3600,
    fireplace: "Majestic Meridian 36\" Gas Fireplace",
    createdDate: "2026-02-18",
    lastUpdated: "2026-02-23",
    notes: "Estimate sent 2/18. Following up this week. Customer comparing with one other quote.",
    priority: "normal",
    products: [
      {
        name: "Majestic Meridian MERID36IN",
        sku: "MERID36IN",
        orderStatus: "pending",
        vendor: "Majestic Distributor",
        cost: 2400,
      },
    ],
  },
  {
    id: "P005",
    customer: "Garcia Residence",
    address: "987 Birch Lane, Chatham, IL",
    stage: "lead",
    value: 5500,
    fireplace: "Valor H5 Radiant Gas Fireplace (TBD)",
    createdDate: "2026-02-22",
    lastUpdated: "2026-02-22",
    notes: "Initial inquiry — wants to replace wood fireplace with gas. Site visit scheduled 3/1.",
    priority: "low",
    products: [],
  },
  {
    id: "P006",
    customer: "Chen Residence",
    address: "147 Walnut Way, Springfield, IL",
    stage: "installed",
    value: 3100,
    fireplace: "Napoleon Ascent 42 Gas Fireplace",
    assignedTech: "Mike R.",
    scheduledDate: "2026-02-20",
    createdDate: "2026-01-15",
    lastUpdated: "2026-02-20",
    notes: "Installation complete. Invoice sent. Awaiting payment.",
    priority: "normal",
    products: [
      {
        name: "Napoleon Ascent 42 B42NTR",
        sku: "B42NTR",
        orderStatus: "arrived",
        orderedDate: "2026-01-20",
        arrivedDate: "2026-02-05",
        vendor: "Napoleon Direct",
        cost: 2100,
      },
    ],
  },
];

const stageConfig: Record<ProjectStage, { label: string; color: string; bg: string; dot: string }> = {
  lead:      { label: "Lead",      color: "text-gray-400",   bg: "bg-gray-500/20",   dot: "bg-gray-400" },
  quoted:    { label: "Quoted",    color: "text-blue-400",   bg: "bg-blue-500/20",   dot: "bg-blue-400" },
  approved:  { label: "Approved",  color: "text-purple-400", bg: "bg-purple-500/20", dot: "bg-purple-400" },
  ordered:   { label: "Ordered",   color: "text-amber-400",  bg: "bg-amber-500/20",  dot: "bg-amber-400" },
  scheduled: { label: "Scheduled", color: "text-orange-400", bg: "bg-orange-500/20", dot: "bg-orange-400" },
  installed: { label: "Installed", color: "text-green-400",  bg: "bg-green-500/20",  dot: "bg-green-400" },
};

const orderStatusConfig: Record<OrderStatus, { label: string; color: string; icon: string }> = {
  pending:    { label: "Not Ordered",  color: "text-gray-400",   icon: "⏳" },
  ordered:    { label: "Ordered",      color: "text-blue-400",   icon: "📦" },
  in_transit: { label: "In Transit",   color: "text-amber-400",  icon: "🚚" },
  arrived:    { label: "Arrived",      color: "text-green-400",  icon: "✅" },
  delayed:    { label: "Delayed",      color: "text-red-400",    icon: "⚠️" },
};

const stageOrder: ProjectStage[] = ["lead", "quoted", "approved", "ordered", "scheduled", "installed"];

export default function SalesFunnel() {
  const [selectedStage, setSelectedStage] = useState<ProjectStage | "all">("all");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [view, setView] = useState<"pipeline" | "kanban">("pipeline");

  const filteredProjects = selectedStage === "all"
    ? mockProjects
    : mockProjects.filter((p) => p.stage === selectedStage);

  const stageCounts = stageOrder.reduce((acc, stage) => {
    acc[stage] = mockProjects.filter((p) => p.stage === stage).length;
    return acc;
  }, {} as Record<ProjectStage, number>);

  const totalPipelineValue = mockProjects
    .filter((p) => p.stage !== "installed")
    .reduce((sum, p) => sum + p.value, 0);

  const totalInstalledValue = mockProjects
    .filter((p) => p.stage === "installed")
    .reduce((sum, p) => sum + p.value, 0);

  const getProductsReadiness = (project: Project) => {
    if (project.products.length === 0) return null;
    const arrived = project.products.filter((p) => p.orderStatus === "arrived").length;
    return { arrived, total: project.products.length, ready: arrived === project.products.length };
  };

  const getDaysUntil = (dateStr?: string) => {
    if (!dateStr) return null;
    const diff = Math.ceil((new Date(dateStr).getTime() - NOW_MS) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {/* Header */}
      <div className="p-5 border-b" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Sales Pipeline
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              Upcoming projects &amp; product tracking
            </p>
          </div>
          {/* View Toggle */}
          <div className="flex bg-[#252540] rounded-lg p-1 gap-1">
            <button
              onClick={() => setView("pipeline")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === "pipeline" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === "kanban" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              Board
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#252540] rounded-xl p-3">
            <p className="text-xs text-gray-400">Pipeline Value</p>
            <p className="text-lg font-bold text-orange-400 mt-0.5">
              ${totalPipelineValue.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">{mockProjects.filter(p => p.stage !== "installed").length} active projects</p>
          </div>
          <div className="bg-[#252540] rounded-xl p-3">
            <p className="text-xs text-gray-400">Installed (MTD)</p>
            <p className="text-lg font-bold text-green-400 mt-0.5">
              ${totalInstalledValue.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">{mockProjects.filter(p => p.stage === "installed").length} completed</p>
          </div>
          <div className="bg-[#252540] rounded-xl p-3">
            <p className="text-xs text-gray-400">Ready to Install</p>
            <p className="text-lg font-bold text-blue-400 mt-0.5">
              {mockProjects.filter(p => p.stage === "scheduled").length}
            </p>
            <p className="text-xs text-gray-500">jobs scheduled</p>
          </div>
        </div>
      </div>

      {/* Stage Filter Pills */}
      <div className="px-5 py-3 flex gap-2 overflow-x-auto border-b" style={{ borderColor: "var(--color-border)" }}>
        <button
          onClick={() => setSelectedStage("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            selectedStage === "all"
              ? "bg-orange-500 text-white"
              : "bg-[#252540] text-gray-400 hover:text-white"
          }`}
        >
          All ({mockProjects.length})
        </button>
        {stageOrder.map((stage) => {
          const cfg = stageConfig[stage];
          return (
            <button
              key={stage}
              onClick={() => setSelectedStage(stage)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedStage === stage
                  ? `${cfg.bg} ${cfg.color} ring-1 ring-current`
                  : "bg-[#252540] text-gray-400 hover:text-white"
              }`}
            >
              {cfg.label} ({stageCounts[stage]})
            </button>
          );
        })}
      </div>

      {/* Pipeline List View */}
      {view === "pipeline" && (
        <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
          {filteredProjects.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <p className="text-sm">No projects in this stage</p>
            </div>
          )}
          {filteredProjects.map((project) => {
            const stageCfg = stageConfig[project.stage];
            const readiness = getProductsReadiness(project);
            const daysUntil = getDaysUntil(project.scheduledDate);
            const isExpanded = expandedProject === project.id;

            return (
              <div key={project.id} className="p-5">
                {/* Project Header Row */}
                <div
                  className="flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                >
                  {/* Stage Dot */}
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${stageCfg.dot}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
                            {project.customer}
                          </p>
                          {project.priority === "high" && (
                            <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                              High Priority
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{project.fireplace}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{project.address}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-sm text-orange-400">${project.value.toLocaleString()}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${stageCfg.bg} ${stageCfg.color}`}>
                          {stageCfg.label}
                        </span>
                      </div>
                    </div>

                    {/* Quick Status Row */}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {/* Scheduled date */}
                      {project.scheduledDate && (
                        <div className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className={`text-xs ${
                            daysUntil !== null && daysUntil <= 3 ? "text-orange-400 font-medium" : "text-gray-400"
                          }`}>
                            {daysUntil !== null
                              ? daysUntil < 0
                                ? `${Math.abs(daysUntil)}d ago`
                                : daysUntil === 0
                                ? "Today"
                                : `${daysUntil}d away`
                              : project.scheduledDate}
                          </span>
                        </div>
                      )}

                      {/* Tech assigned */}
                      {project.assignedTech && (
                        <div className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="text-xs text-gray-400">{project.assignedTech}</span>
                        </div>
                      )}

                      {/* Products readiness */}
                      {readiness && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs">{readiness.ready ? "✅" : "📦"}</span>
                          <span className={`text-xs ${readiness.ready ? "text-green-400" : "text-amber-400"}`}>
                            {readiness.arrived}/{readiness.total} parts arrived
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <svg
                    className={`w-4 h-4 text-gray-500 flex-shrink-0 mt-1 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="mt-4 ml-5 space-y-4">
                    {/* Notes */}
                    {project.notes && (
                      <div className="bg-[#252540] rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-1">Notes</p>
                        <p className="text-sm text-gray-300">{project.notes}</p>
                      </div>
                    )}

                    {/* Products / Order Tracking */}
                    {project.products.length > 0 && (
                      <div className="bg-[#252540] rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-3 font-medium">Product &amp; Order Tracking</p>
                        <div className="space-y-3">
                          {project.products.map((product, i) => {
                            const osCfg = orderStatusConfig[product.orderStatus];
                            return (
                              <div key={i} className="border-b border-gray-700 last:border-0 pb-3 last:pb-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate">{product.name}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">SKU: {product.sku} · {product.vendor}</p>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-semibold text-gray-300">${product.cost.toLocaleString()}</p>
                                    <span className={`text-xs ${osCfg.color}`}>
                                      {osCfg.icon} {osCfg.label}
                                    </span>
                                  </div>
                                </div>

                                {/* Order Timeline */}
                                <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                                  {product.orderedDate && (
                                    <span>Ordered: <span className="text-gray-300">{product.orderedDate}</span></span>
                                  )}
                                  {product.etaDate && product.orderStatus !== "arrived" && (
                                    <span>ETA: <span className={`font-medium ${
                                      getDaysUntil(product.etaDate) !== null && getDaysUntil(product.etaDate)! <= 3
                                        ? "text-orange-400"
                                        : "text-gray-300"
                                    }`}>{product.etaDate}</span></span>
                                  )}
                                  {product.arrivedDate && (
                                    <span>Arrived: <span className="text-green-400">{product.arrivedDate}</span></span>
                                  )}
                                  {product.orderStatus === "pending" && (
                                    <span className="text-amber-400">⚠️ Not yet ordered</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Products cost total */}
                        <div className="mt-3 pt-3 border-t border-gray-700 flex justify-between text-sm">
                          <span className="text-gray-400">Products Cost</span>
                          <span className="font-semibold text-gray-300">
                            ${project.products.reduce((s, p) => s + p.cost, 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Stage Progress Bar */}
                    <div className="bg-[#252540] rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-2">Project Stage</p>
                      <div className="flex items-center gap-1">
                        {stageOrder.map((stage, i) => {
                          const currentIdx = stageOrder.indexOf(project.stage);
                          const isPast = i < currentIdx;
                          const isCurrent = i === currentIdx;
                          const cfg = stageConfig[stage];
                          return (
                            <div key={stage} className="flex items-center flex-1">
                              <div className={`flex-1 h-1.5 rounded-full ${
                                isPast ? "bg-orange-500" : isCurrent ? "bg-orange-500/60" : "bg-gray-700"
                              }`} />
                              {i < stageOrder.length - 1 && (
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  isPast || isCurrent ? cfg.dot : "bg-gray-700"
                                }`} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-gray-500">Lead</span>
                        <span className="text-xs text-gray-500">Installed</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button className="flex-1 bg-orange-500/20 text-orange-400 border border-orange-500/40 py-2 rounded-xl text-xs font-medium hover:bg-orange-500/30 transition-colors">
                        Update Stage
                      </button>
                      <button className="flex-1 bg-[#252540] text-gray-300 border border-gray-700 py-2 rounded-xl text-xs font-medium hover:border-gray-500 transition-colors">
                        Add Note
                      </button>
                      <button className="flex-1 bg-[#252540] text-gray-300 border border-gray-700 py-2 rounded-xl text-xs font-medium hover:border-gray-500 transition-colors">
                        Order Parts
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Kanban Board View */}
      {view === "kanban" && (
        <div className="p-4 overflow-x-auto">
          <div className="flex gap-3 min-w-max">
            {stageOrder.map((stage) => {
              const cfg = stageConfig[stage];
              const stageProjects = mockProjects.filter((p) => p.stage === stage);
              return (
                <div key={stage} className="w-56 flex-shrink-0">
                  {/* Column Header */}
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-2 ${cfg.bg}`}>
                    <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                    <span className={`ml-auto text-xs ${cfg.color} opacity-70`}>{stageProjects.length}</span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2">
                    {stageProjects.map((project) => {
                      const readiness = getProductsReadiness(project);
                      return (
                        <div
                          key={project.id}
                          className="bg-[#252540] rounded-xl p-3 border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <p className="text-xs font-semibold text-white leading-tight">{project.customer}</p>
                            {project.priority === "high" && (
                              <span className="text-red-400 text-xs flex-shrink-0">🔴</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 truncate mb-2">{project.fireplace}</p>
                          <p className="text-sm font-bold text-orange-400">${project.value.toLocaleString()}</p>
                          {project.scheduledDate && (
                            <p className="text-xs text-gray-500 mt-1">
                              📅 {project.scheduledDate}
                            </p>
                          )}
                          {readiness && (
                            <p className={`text-xs mt-1 ${readiness.ready ? "text-green-400" : "text-amber-400"}`}>
                              {readiness.ready ? "✅" : "📦"} {readiness.arrived}/{readiness.total} parts
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {stageProjects.length === 0 && (
                      <div className="border-2 border-dashed border-gray-700 rounded-xl p-4 text-center">
                        <p className="text-xs text-gray-600">No projects</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
