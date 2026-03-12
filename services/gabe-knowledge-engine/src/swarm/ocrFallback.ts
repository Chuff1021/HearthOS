export type OcrResult = { text: string; confidence: number; used: boolean; source: "native" | "ocr" | "hybrid" };

export async function runOcrFallback(input: {
  nativeText: string;
  imageRef?: string;
  diagramLikely?: boolean;
}) : Promise<OcrResult> {
  const nativeLen = (input.nativeText || "").trim().length;
  const weakNative = nativeLen < 120;
  const shouldOcr = weakNative || Boolean(input.diagramLikely);

  if (!shouldOcr) {
    return { text: input.nativeText || "", confidence: 0.99, used: false, source: "native" };
  }

  // Foundation path: OCR provider can be plugged in via env/service later.
  // For now we preserve safety by not fabricating OCR text.
  const ocrText = "";
  const ocrConfidence = 0;

  if (ocrText && ocrConfidence > 0.7) {
    const merged = `${input.nativeText || ""}\n${ocrText}`.trim();
    return { text: merged, confidence: Math.max(0.7, ocrConfidence), used: true, source: input.nativeText ? "hybrid" : "ocr" };
  }

  return {
    text: input.nativeText || "",
    confidence: weakNative ? 0.45 : 0.8,
    used: shouldOcr,
    source: "native",
  };
}
