#!/usr/bin/env python3
import json, os, sys
from pathlib import Path

if len(sys.argv) < 3:
    print("usage: pdf_extract_images.py <pdf> <out_dir>")
    sys.exit(1)

pdf = sys.argv[1]
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

# Stub: integrate PyMuPDF/pdfplumber image extraction in next pass.
(Path(out / "_stub.txt")).write_text(f"image extraction stub for {pdf}\n")
print(str(out))
