#!/usr/bin/env python3
import json, sys
from pathlib import Path

if len(sys.argv) < 3:
    print("usage: ocr_images.py <images_dir> <out_json>")
    sys.exit(1)

images_dir = Path(sys.argv[1])
out_json = Path(sys.argv[2])

# Stub OCR stage. Replace with pytesseract pipeline.
out_json.write_text(json.dumps({"images_dir": str(images_dir), "ocr": []}, indent=2))
print(str(out_json))
