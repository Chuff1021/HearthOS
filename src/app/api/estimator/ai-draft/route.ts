import { NextRequest, NextResponse } from 'next/server';
import { getJobs } from '@/app/api/jobs/route';

type EstimateLine = {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
  source: 'rule' | 'historical';
};

function line(description: string, qty: number, unitPrice: number, source: 'rule' | 'historical' = 'rule'): EstimateLine {
  return { description, qty, unitPrice, total: qty * unitPrice, source };
}

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();
    const q = String(prompt || '').toLowerCase();

    if (!q || q.length < 8) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Lightweight parser
    const isApex42 = q.includes('42 apex');
    const hasTimberlineFace = q.includes('timberline');
    const pipeFeetMatch = q.match(/(\d+)\s*(ft|feet|foot)\s*(of\s*)?pipe/);
    const pipeFeet = pipeFeetMatch ? Number(pipeFeetMatch[1]) : 20;

    const lines: EstimateLine[] = [];

    // Core model rules
    if (isApex42) {
      lines.push(line('42 Apex Wood Fireplace Unit', 1, 4895));
      lines.push(line('42 Apex Framing/Install Kit', 1, 395));
      lines.push(line('Firestop + Support Components', 1, 260));
      lines.push(line('Termination Cap', 1, 185));
    } else {
      lines.push(line('Fireplace Unit (Model TBD)', 1, 4200));
      lines.push(line('Standard Install Kit', 1, 350));
    }

    if (hasTimberlineFace) {
      lines.push(line('Timberline Face Kit', 1, 925));
    }

    const pipeSections = Math.max(1, Math.ceil(pipeFeet / 4));
    lines.push(line('Venting Pipe Sections (4ft)', pipeSections, 128));
    lines.push(line('Venting Elbows / Offsets (allowance)', 2, 95));

    // Labor
    lines.push(line('Install Labor - Lead Tech', 16, 145));
    lines.push(line('Install Labor - Helper', 12, 85));

    // Pull historical signal (same family jobs)
    const jobs = await getJobs();
    const similar = jobs.filter((j) =>
      j.title.toLowerCase().includes('installation') ||
      j.title.toLowerCase().includes('fireplace') ||
      j.fireplaceUnit?.model?.toLowerCase().includes('apex')
    ).slice(0, 5);

    if (similar.length > 0) {
      const avgTotal = similar.reduce((sum, j) => sum + Number(j.totalAmount || 0), 0) / similar.length;
      lines.push(line(`Historical Install Cost Benchmark (${similar.length} jobs)`, 1, Math.round(avgTotal), 'historical'));
    }

    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    const taxRate = 8;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    return NextResponse.json({
      draftEstimate: {
        prompt,
        assumptions: {
          model: isApex42 ? '42 Apex' : 'Unknown model',
          face: hasTimberlineFace ? 'Timberline' : 'Not specified',
          pipeFeet,
        },
        lines,
        subtotal,
        taxRate,
        taxAmount,
        total,
      },
    });
  } catch (err) {
    console.error('Failed to generate AI draft estimate:', err);
    return NextResponse.json({ error: 'Failed to generate draft estimate' }, { status: 500 });
  }
}
