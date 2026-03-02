export type Chunk = {
  page: number;
  text: string;
  section_title?: string;
};

function estimateTokens(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 0.75);
}

export function chunkPages(
  pages: Array<{ page: number; text: string }>,
  minTokens = 500,
  maxTokens = 800,
  overlapSentences = 2
): Chunk[] {
  const chunks: Chunk[] = [];

  for (const page of pages) {
    const { sentences, sectionTitle } = splitWithSection(page.text);
    let buffer: string[] = [];
    let bufferTokens = 0;

    for (const sentence of sentences) {
      const nextTokens = estimateTokens(sentence);
      if (bufferTokens + nextTokens > maxTokens && bufferTokens >= minTokens) {
        chunks.push({ page: page.page, text: buffer.join(" "), section_title: sectionTitle });
        buffer = overlapSentences > 0 ? buffer.slice(-overlapSentences) : [];
        bufferTokens = buffer.reduce((sum, s) => sum + estimateTokens(s), 0);
      }
      buffer.push(sentence);
      bufferTokens += nextTokens;
    }

    if (buffer.length > 0) {
      chunks.push({ page: page.page, text: buffer.join(" "), section_title: sectionTitle });
    }
  }

  return chunks;
}

function splitWithSection(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let sectionTitle: string | undefined;

  // Prefer section headers related to combustion air and framing dimensions when available.
  const prioritized = lines.find((line) => /outside air|combustion air|air intake|oak|framing|dimensions|rough opening/i.test(line));
  if (prioritized && isSectionHeader(prioritized)) {
    sectionTitle = prioritized.replace(/\s+/g, " ").slice(0, 120);
  }

  if (!sectionTitle) {
    for (const line of lines) {
      if (isSectionHeader(line)) {
        sectionTitle = line.replace(/\s+/g, " ").slice(0, 120);
        break;
      }
    }
  }

  const normalized = text.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { sentences, sectionTitle };
}

function isSectionHeader(line: string) {
  if (line.length < 4 || line.length > 80) return false;
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return false;
  const upperRatio = letters.replace(/[^A-Z]/g, "").length / letters.length;
  if (upperRatio > 0.7) return true;
  if (line.endsWith(":")) return true;
  return false;
}
