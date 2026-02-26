// GABE Message Log Store
// Stores all tech-to-GABE conversations for audit and review

export interface GabeMessage {
  id: string;
  timestamp: string;
  techId?: string;
  techName?: string;
  jobId?: string;
  jobNumber?: string;
  customerName?: string;
  fireplace?: string;
  messages: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }[];
  duration?: number; // seconds
  rating?: number; // 1-5
  flagged?: boolean;
  flagReason?: string;
}

// In-memory message store
let gabeMessages: GabeMessage[] = [
  // Sample historical messages for demo
  {
    id: "msg-001",
    timestamp: "2026-02-26T09:15:00Z",
    techId: "tech-001",
    techName: "Mike Johnson",
    jobId: "job-003",
    jobNumber: "JOB-2026-0144",
    customerName: "Patricia Williams",
    fireplace: "Heat & Glo SLR-FT",
    messages: [
      {
        role: "user",
        content: "Customer says pilot light keeps going out after a few minutes. What should I check?",
        timestamp: "2026-02-26T09:15:00Z",
      },
      {
        role: "assistant",
        content: "This is a common issue! Here's what to check:\n\n1. **Thermocouple** - This is the most likely culprit. The thermocouple senses pilot heat and tells the gas valve to stay open. If it's weak or dirty, it won't generate enough voltage (should be 15-30mV). Clean the tip with fine sandpaper or replace ($15-30).\n\n2. **Thermopile** - If it's a newer unit with electronic ignition, check the thermopile (should read 350-750mV when heated).\n\n3. **Gas pressure** - Check inlet pressure at the valve (should be 5-7\" WC for natural gas).\n\n4. **Flame impingement** - Make sure the pilot flame properly engulfs the thermocouple/thermopile.\n\n5. **Draft** - Check for downdrafts from appliances, HVAC, or wind.\n\nStart with the thermocouple - it's the #1 cause of this issue!",
        timestamp: "2026-02-26T09:15:30Z",
      },
    ],
    duration: 30,
    rating: 5,
    flagged: false,
  },
  {
    id: "msg-002",
    timestamp: "2026-02-26T10:30:00Z",
    techId: "tech-002",
    techName: "Sarah Williams",
    jobId: "job-002",
    jobNumber: "JOB-2026-0143",
    customerName: "Robert Chen",
    fireplace: "Napoleon GVFL60",
    messages: [
      {
        role: "user",
        content: "Installing a Napoleon GVFL60 in a new construction. What's the minimum vent termination height from the deck?",
        timestamp: "2026-02-26T10:30:00Z",
      },
      {
        role: "assistant",
        content: "For the Napoleon GVFL60 direct vent fireplace, here are the vent termination requirements:\n\n**Horizontal termination (wall-mounted):**\n- Minimum: 12\" from grade, 12\" from windows/doors, 24\" from air intakes\n- Must be at least 12\" below any operable window\n\n**Vertical termination (roof):**\n- Minimum: 3 feet above the roof penetration\n- 2 feet above any portion of roof within 10 feet horizontally\n\n**Additional clearances:**\n- 6\" from vinyl soffits\n- 36\" from grass/plants (to prevent discoloration)\n- 12\" minimum from corners\n\n**Pro tip:** Always verify with the specific installation manual. The GVFL60 manual is at: https://downloads.hearthnhome.com/installmanuals/Napoleon_GVFL60_Install.pdf\n\nLet me know if you need help with any other aspect of this install!",
        timestamp: "2026-02-26T10:31:00Z",
      },
    ],
    duration: 60,
    rating: 5,
    flagged: false,
  },
  {
    id: "msg-003",
    timestamp: "2026-02-26T11:45:00Z",
    techId: "tech-003",
    techName: "Tom Davis",
    jobId: "job-007",
    jobNumber: "JOB-2026-0147",
    customerName: "Karen Wilson",
    fireplace: "Valor H4",
    messages: [
      {
        role: "user",
        content: "Valor H4 fireplace - flame is orange and sooty. What's going on?",
        timestamp: "2026-02-26T11:45:00Z",
      },
      {
        role: "assistant",
        content: "Orange flames with soot = **too much air** or **dirty gas**.\n\n**Here's the troubleshooting order:**\n\n1. **Primary air shutter** - Located at the burner. Open it up more to increase air. Start with it fully open and close gradually until flames turn blue.\n\n2. **Check gas type** - Verify it's set for the correct gas (NG vs LP). Wrong orifice = yellow flames.\n\n3. **Inspect burner** - Remove and check for debris, spider webs, or corrosion.\n\n4. **Gas pressure** - Check with a manometer. Should be 3.5-7\" WC for NG.\n\n5. **Orifice** - Check for blockage or wrong size.\n\n**Safety first:** If you smell gas or suspect a leak, shut off immediately and leak check with soap solution.\n\nThe Valor H4 is a great unit - let me know what you find!",
        timestamp: "2026-02-26T11:46:00Z",
      },
    ],
    duration: 60,
    rating: 4,
    flagged: false,
  },
  {
    id: "msg-004",
    timestamp: "2026-02-25T14:20:00Z",
    techId: "tech-001",
    techName: "Mike Johnson",
    jobId: "job-001",
    jobNumber: "JOB-2026-0142",
    customerName: "Linda Martinez",
    fireplace: "Regency HZ40E",
    messages: [
      {
        role: "user",
        content: "Annual cleaning on a Regency HZ40E. What should I check besides the obvious?",
        timestamp: "2026-02-25T14:20:00Z",
      },
      {
        role: "assistant",
        content: "Great question! For the HZ40E annual service, here's your **complete checklist**:\n\n**Safety:**\n- CO test (before and after lighting)\n- Verify proper venting and draft\n- Check gas connections with leak detector\n- Inspect firebox for cracks or corrosion\n\n**Cleaning:**\n- Remove and clean burner\n- Vacuum pilot assembly area\n- Clean glass (use Regency-approved cleaner)\n- Check log placement\n- Vacuum or brush vents\n\n**Operational:**\n- Light and let run 15+ min\n- Check flame picture (should be blue at base, orange tips okay)\n- Verify thermostat/timer operation\n- Test all safety features\n\n**Documentation:**\n- Take before/after photos\n- Note any issues for customer\n- Update service record\n\nThe HZ40E manual: https://downloads.hearthnhome.com/installmanuals/20005590_Regency_HZ40E_Owners.pdf\n\nAnything specific you're unsure about?",
        timestamp: "2026-02-25T14:21:30Z",
      },
    ],
    duration: 90,
    rating: 5,
    flagged: false,
  },
];

let nextMsgId = 5;

// Get all messages, optionally filtered
export function getGabeMessages(filters?: {
  techId?: string;
  jobId?: string;
  startDate?: string;
  endDate?: string;
  flagged?: boolean;
}): GabeMessage[] {
  let filtered = [...gabeMessages];
  
  if (filters?.techId) {
    filtered = filtered.filter(m => m.techId === filters.techId);
  }
  if (filters?.jobId) {
    filtered = filtered.filter(m => m.jobId === filters.jobId);
  }
  if (filters?.startDate) {
    filtered = filtered.filter(m => m.timestamp >= filters.startDate!);
  }
  if (filters?.endDate) {
    filtered = filtered.filter(m => m.timestamp <= filters.endDate!);
  }
  if (filters?.flagged !== undefined) {
    filtered = filtered.filter(m => m.flagged === filters.flagged);
  }
  
  // Sort by timestamp descending (newest first)
  return filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// Get a single message by ID
export function getGabeMessageById(id: string): GabeMessage | undefined {
  return gabeMessages.find(m => m.id === id);
}

// Save a new message conversation
export function saveGabeMessage(message: Omit<GabeMessage, "id" | "timestamp">): GabeMessage {
  const newMessage: GabeMessage = {
    ...message,
    id: `msg-${String(nextMsgId++).padStart(3, "0")}`,
    timestamp: new Date().toISOString(),
  };
  gabeMessages.unshift(newMessage); // Add to beginning (newest first)
  return newMessage;
}

// Update message (for rating, flagging)
export function updateGabeMessage(id: string, updates: Partial<GabeMessage>): GabeMessage | null {
  const idx = gabeMessages.findIndex(m => m.id === id);
  if (idx === -1) return null;
  
  gabeMessages[idx] = { ...gabeMessages[idx], ...updates };
  return gabeMessages[idx];
}

// Flag a message for review
export function flagGabeMessage(id: string, reason: string): GabeMessage | null {
  return updateGabeMessage(id, { flagged: true, flagReason: reason });
}

// Delete a message
export function deleteGabeMessage(id: string): boolean {
  const idx = gabeMessages.findIndex(m => m.id === id);
  if (idx === -1) return false;
  
  gabeMessages.splice(idx, 1);
  return true;
}

// Get stats
export function getGabeMessageStats() {
  const total = gabeMessages.length;
  const today = gabeMessages.filter(m => m.timestamp.startsWith(new Date().toISOString().split("T")[0])).length;
  const flagged = gabeMessages.filter(m => m.flagged).length;
  const avgRating = gabeMessages.reduce((sum, m) => sum + (m.rating || 0), 0) / total;
  
  // Messages by tech
  const byTech: Record<string, number> = {};
  gabeMessages.forEach(m => {
    if (m.techName) {
      byTech[m.techName] = (byTech[m.techName] || 0) + 1;
    }
  });
  
  return { total, today, flagged, avgRating: avgRating || 0, byTech };
}
