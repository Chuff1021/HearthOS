import { NextResponse } from "next/server";

export interface Tech {
  id: string;
  name: string;
  color: string;
  initials: string;
  status: "available" | "on_job" | "driving" | "break" | "offline";
  currentJob: {
    id: string;
    title: string;
    customer: string;
    address: string;
  } | null;
  nextJob: {
    id: string;
    title: string;
    customer: string;
    scheduledTime: string;
  } | null;
  lat: number;
  lng: number;
  lastUpdate: string;
  jobsToday: number;
  jobsDone: number;
}

export interface UnassignedJob {
  id: string;
  title: string;
  customer: string;
  address: string;
  scheduledTime: string;
  jobType: string;
  priority: "low" | "normal" | "high" | "urgent";
}

// Technicians with live status
const techs: Tech[] = [
  {
    id: "tech-001",
    name: "Mike Johnson",
    color: "#3b82f6",
    initials: "MJ",
    status: "on_job",
    currentJob: {
      id: "job-002",
      title: "Gas Installation",
      customer: "Robert Chen",
      address: "5678 Maple Ave",
    },
    nextJob: {
      id: "job-003",
      title: "Pilot Light Repair",
      customer: "Patricia Williams",
      scheduledTime: "2:00 PM",
    },
    lat: 39.7817,
    lng: -89.6501,
    lastUpdate: "2 min ago",
    jobsToday: 3,
    jobsDone: 1,
  },
  {
    id: "tech-002",
    name: "Sarah Williams",
    color: "#10b981",
    initials: "SW",
    status: "driving",
    currentJob: null,
    nextJob: {
      id: "job-001",
      title: "Annual Cleaning",
      customer: "Linda Martinez",
      scheduledTime: "9:00 AM",
    },
    lat: 39.7950,
    lng: -89.6440,
    lastUpdate: "5 min ago",
    jobsToday: 2,
    jobsDone: 0,
  },
  {
    id: "tech-003",
    name: "Tom Davis",
    color: "#f59e0b",
    initials: "TD",
    status: "available",
    currentJob: null,
    nextJob: null,
    lat: 39.7700,
    lng: -89.6600,
    lastUpdate: "1 min ago",
    jobsToday: 1,
    jobsDone: 1,
  },
  {
    id: "tech-004",
    name: "Chris Lee",
    color: "#8b5cf6",
    initials: "CL",
    status: "break",
    currentJob: null,
    nextJob: {
      id: "job-005",
      title: "Pellet Stove Service",
      customer: "Susan Park",
      scheduledTime: "1:00 PM",
    },
    lat: 39.7850,
    lng: -89.6350,
    lastUpdate: "8 min ago",
    jobsToday: 2,
    jobsDone: 1,
  },
  {
    id: "tech-005",
    name: "Amy Walsh",
    color: "#ec4899",
    initials: "AW",
    status: "offline",
    currentJob: null,
    nextJob: null,
    lat: 39.7600,
    lng: -89.6700,
    lastUpdate: "1 hr ago",
    jobsToday: 0,
    jobsDone: 0,
  },
  {
    id: "tech-006",
    name: "Jake Rivera",
    color: "#2dd4bf",
    initials: "JR",
    status: "available",
    currentJob: null,
    nextJob: null,
    lat: 39.8000,
    lng: -89.6300,
    lastUpdate: "3 min ago",
    jobsToday: 0,
    jobsDone: 0,
  },
];

const unassignedJobs: UnassignedJob[] = [
  {
    id: "job-007",
    title: "Fireplace Estimate",
    customer: "James Wilson",
    address: "555 Cedar Lane",
    scheduledTime: "3:00 PM",
    jobType: "estimate",
    priority: "normal",
  },
  {
    id: "job-008",
    title: "Gas Leak Check",
    customer: "Mary Johnson",
    address: "789 Birch Drive",
    scheduledTime: "4:00 PM",
    jobType: "repair",
    priority: "urgent",
  },
  {
    id: "job-009",
    title: "Annual Inspection",
    customer: "Tom Bradley",
    address: "321 Elm Court",
    scheduledTime: "10:00 AM",
    jobType: "inspection",
    priority: "normal",
  },
];

// GET - Get dispatch data
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";

    let filteredTechs = [...techs];

    if (activeOnly) {
      filteredTechs = filteredTechs.filter((t) => t.status !== "offline");
    }

    return NextResponse.json({
      techs: filteredTechs,
      unassignedJobs,
      stats: {
        totalTechs: techs.length,
        activeTechs: techs.filter((t) => t.status !== "offline").length,
        onJob: techs.filter((t) => t.status === "on_job").length,
        available: techs.filter((t) => t.status === "available").length,
        unassigned: unassignedJobs.length,
      },
    });
  } catch (err) {
    console.error("Failed to get dispatch data:", err);
    return NextResponse.json({ error: "Failed to get dispatch data" }, { status: 500 });
  }
}

// PUT - Update tech status
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { techId, status, currentJobId } = body;

    const techIdx = techs.findIndex((t) => t.id === techId);
    if (techIdx === -1) {
      return NextResponse.json({ error: "Tech not found" }, { status: 404 });
    }

    if (status) {
      techs[techIdx].status = status;
      techs[techIdx].lastUpdate = "Just now";
    }

    if (currentJobId === null) {
      techs[techIdx].currentJob = null;
    }

    return NextResponse.json({ tech: techs[techIdx] });
  } catch (err) {
    console.error("Failed to update tech status:", err);
    return NextResponse.json({ error: "Failed to update tech status" }, { status: 500 });
  }
}
