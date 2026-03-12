#!/usr/bin/env python3
import json, sys
from pathlib import Path

if len(sys.argv) < 3:
    print("usage: pdf_extract_images.py <pdf> <out_dir>")
    sys.exit(1)

pdf_path = Path(sys.argv[1])
out_dir = Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)

images = []
try:
    import fitz  # PyMuPDF
    doc = fitz.open(pdf_path)
    for page_index in range(len(doc)):
        page = doc[page_index]
        for img_index, img in enumerate(page.get_images(full=True)):
            xref = img[0]
            pix = fitz.Pixmap(doc, xref)
            if pix.n > 4:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            fname = f"page-{page_index+1:03d}-img-{img_index+1:02d}.png"
            fpath = out_dir / fname
            pix.save(fpath)
            images.append({"page": page_index + 1, "image_path": str(fpath)})
except Exception as e:
    (out_dir / "_error.txt").write_text(str(e))

(out_dir / "images_manifest.json").write_text(json.dumps({"pdf": str(pdf_path), "images": images}, indent=2))
print(str(out_dir / "images_manifest.json"))
