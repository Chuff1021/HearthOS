#!/usr/bin/env python3
import json, sys
from pathlib import Path

if len(sys.argv) < 3:
    print("usage: ocr_images.py <images_dir> <out_json>")
    sys.exit(1)

images_dir = Path(sys.argv[1])
out_json = Path(sys.argv[2])

rows = []
try:
    import pytesseract
    from PIL import Image
    manifest = images_dir / "images_manifest.json"
    images = json.loads(manifest.read_text()).get("images", []) if manifest.exists() else []
    for item in images:
      p = Path(item["image_path"])
      text = ""
      try:
        text = pytesseract.image_to_string(Image.open(p))
      except Exception:
        text = ""
      rows.append({"page": item.get("page"), "image_path": str(p), "ocr_text": text.strip()})
except Exception as e:
    rows.append({"error": str(e)})

out_json.write_text(json.dumps({"ocr": rows}, indent=2))
print(str(out_json))
