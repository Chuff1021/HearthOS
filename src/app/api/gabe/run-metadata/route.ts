import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

const FILE = '/var/lib/hearthos-data/gabe/run-metadata.jsonl';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(500, Number(searchParams.get('limit') || 100)));

    if (!fs.existsSync(FILE)) return NextResponse.json({ runs: [], total: 0 });
    const lines = fs.readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean);
    const selected = lines.slice(-limit).reverse().map((ln) => {
      try { return JSON.parse(ln); } catch { return null; }
    }).filter(Boolean);

    return NextResponse.json({ runs: selected, total: lines.length });
  } catch {
    return NextResponse.json({ error: 'Failed to read run metadata' }, { status: 500 });
  }
}
