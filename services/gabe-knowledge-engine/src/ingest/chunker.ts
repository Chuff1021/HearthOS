type Chunk = {
  page: number;
  text: string;
};

function estimateTokens(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 0.75);
}

export function chunkPages(
  pages: Array<{ page: number; text: string }>,
  minTokens = 500,
  maxTokens = 800
) {
  const chunks: Chunk[] = [];

  for (const page of pages) {
    const sentences = page.text.split(/(?<=[.!?])\s+/);
    let buffer: string[] = [];
    let bufferTokens = 0;

    for (const sentence of sentences) {
      const nextTokens = estimateTokens(sentence);
      if (bufferTokens + nextTokens > maxTokens && bufferTokens >= minTokens) {
        chunks.push({ page: page.page, text: buffer.join(" ") });
        buffer = [];
        bufferTokens = 0;
      }
      buffer.push(sentence);
      bufferTokens += nextTokens;
    }

    if (buffer.length > 0) {
      chunks.push({ page: page.page, text: buffer.join(" ") });
    }
  }

  return chunks;
}
