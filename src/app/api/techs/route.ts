import { NextResponse } from "next/server";

export interface Tech {
  id: string;
  name: string;
  email: string;
  phone: string;
  color: string;
  initials: string;
  role: "lead" | "tech" | "helper";
  active: boolean;
  skills: string[];
  certifications: string[];
  hireDate: string;
}

// Technicians data
const techs: Tech[] = [
  {
    id: "tech-001",
    name: "Mike Johnson",
    email: "mike@hearthos.com",
    phone: "(555) 111-2222",
    color: "#2563EB",
    initials: "MJ",
    role: "lead",
    active: true,
    skills: ["Gas Installation", "Repair", "Inspection"],
    certifications: ["NFI Certified", "Gas Line Certified"],
    hireDate: "2022-03-15",
  },
  {
    id: "tech-002",
    name: "Sarah Williams",
    email: "sarah@hearthos.com",
    phone: "(555) 222-3333",
    color: "#98CD00",
    initials: "SW",
    role: "tech",
    active: true,
    skills: ["Estimates", "Sales", "Installation"],
    certifications: ["NFI Certified", "CSST Certified"],
    hireDate: "2023-01-10",
  },
  {
    id: "tech-003",
    name: "Tom Davis",
    email: "tom@hearthos.com",
    phone: "(555) 333-4444",
    color: "#FF4400",
    initials: "TD",
    role: "tech",
    active: true,
    skills: ["Wood Stoves", "Pellet", "Chimney"],
    certifications: ["CSIA Certified", "NFI Certified"],
    hireDate: "2021-08-22",
  },
  {
    id: "tech-004",
    name: "Chris Lee",
    email: "chris@hearthos.com",
    phone: "(555) 444-5555",
    color: "#2563EB",
    initials: "CL",
    role: "tech",
    active: true,
    skills: ["Gas Repair", "Maintenance", "Service"],
    certifications: ["NFI Certified"],
    hireDate: "2023-06-01",
  },
  {
    id: "tech-005",
    name: "Amy Walsh",
    email: "amy@hearthos.com",
    phone: "(555) 555-6666",
    color: "#FF204E",
    initials: "AW",
    role: "tech",
    active: true,
    skills: ["Installation", "Helper", "Delivery"],
    certifications: ["OSHA 10"],
    hireDate: "2024-02-15",
  },
  {
    id: "tech-006",
    name: "Jake Rivera",
    email: "jake@hearthos.com",
    phone: "(555) 666-7777",
    color: "#98CD00",
    initials: "JR",
    role: "helper",
    active: true,
    skills: ["Helper", "Delivery", "Setup"],
    certifications: [],
    hireDate: "2024-11-01",
  },
];

// GET - List technicians
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";

    let filtered = [...techs];
    if (activeOnly) {
      filtered = filtered.filter((t) => t.active);
    }

    return NextResponse.json({ techs: filtered });
  } catch (err) {
    console.error("Failed to get techs:", err);
    return NextResponse.json({ error: "Failed to get technicians" }, { status: 500 });
  }
}

// POST - Create technician
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const initials = body.name
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase();

    const newTech: Tech = {
      id: `tech-${String(techs.length + 1).padStart(3, "0")}`,
      name: body.name,
      email: body.email || "",
      phone: body.phone || "",
      color: body.color || "#6b7280",
      initials,
      role: body.role || "tech",
      active: true,
      skills: body.skills || [],
      certifications: body.certifications || [],
      hireDate: new Date().toISOString().split("T")[0],
    };

    techs.push(newTech);
    return NextResponse.json({ tech: newTech }, { status: 201 });
  } catch (err) {
    console.error("Failed to create tech:", err);
    return NextResponse.json({ error: "Failed to create technician" }, { status: 500 });
  }
}

// DELETE - Remove technician
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ error: "Tech ID required" }, { status: 400 });
    }
    
    const index = techs.findIndex((t) => t.id === id);
    if (index === -1) {
      return NextResponse.json({ error: "Technician not found" }, { status: 404 });
    }
    
    const deleted = techs.splice(index, 1)[0];
    return NextResponse.json({ tech: deleted });
  } catch (err) {
    console.error("Failed to delete tech:", err);
    return NextResponse.json({ error: "Failed to delete technician" }, { status: 500 });
  }
}
