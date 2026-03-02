# Diagram-aware framing dimension extraction (first pass)

This pipeline is meant to pull framing dimensions from manual diagrams where plain PDF text extraction misses labels and callouts.

## What it does

1. Renders selected PDF pages to PNG (`pdftoppm`, 300 DPI)
2. Runs OCR on each rendered page (`tesseract`, English)
3. Detects dimension-like tokens:
   - label-value patterns: `A 42"`, `B: 1067 mm`, `38 1/2 in C`
   - generic dimensions: `42"`, `1067 mm`
4. Normalizes output to both original unit and millimeters
5. Emits JSON with page + source metadata

## Prerequisites

Install binaries used by the extractor:

- `pdftoppm` (Poppler)
- `tesseract`

Ubuntu/Debian example:

```bash
sudo apt-get update
sudo apt-get install -y poppler-utils tesseract-ocr
```

## Run

From `services/gabe-knowledge-engine`:

```bash
npm run extract:framing -- \
  --file /root/HearthOS/manuals/FPX-42-Apex-Installation-Manual.pdf \
  --pages 18-22 \
  --title "FPX 42 Apex Installation Manual" \
  --manufacturer "Fireplace Xtrordinair" \
  --model "42 Apex" \
  --out ./tmp/fpx42-apex.framing-dimensions.json
```

Optional flags:

- `--image-dir ./tmp/fpx42-pages` keep rendered page images in a fixed directory
- `--keep-images` keep images when using temp rendering dir

## Output shape

Each candidate includes:

- `page`
- `label` (`a`, `b`, `c`, or `null`)
- `value`
- `unit` (`in` or `mm`)
- `normalizedMm`
- `raw` (matched token)
- `context` (OCR line)
- `source` (`pdfPath`, `imagePath`, `manualTitle`, `manufacturer`, `model`)

## Notes / limitations (first pass)

- OCR quality drives extraction quality; low-contrast scans may miss labels.
- Label support is currently `A/B/C` as requested.
- Pattern detection is regex-based and intentionally conservative.
- This pass does not infer geometric relationships from arrows/line segments yet.
