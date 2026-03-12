#!/usr/bin/env python3
import json, re, sys
from pathlib import Path

if len(sys.argv) < 3:
    print("usage: classify_diagrams.py <images_dir> <out_json>")
    sys.exit(1)

images_dir = Path(sys.argv[1])
out_json = Path(sys.argv[2])
ocr_json = images_dir.parent / "ocr.json"
rows = json.loads(ocr_json.read_text()).get("ocr", []) if ocr_json.exists() else []

out = []
for r in rows:
    text = (r.get("ocr_text") or "").lower()
    t = "parts_exploded_view"
    if re.search(r"framing|rough opening|width|height|depth", text):
        t = "framing_dimensions"
    elif re.search(r"clearance|mantel|combustible", text):
        t = "clearances"
    elif re.search(r"vent|horizontal|vertical|termination|rise", text):
        t = "venting_diagram"
    elif re.search(r"wire|transformer|module|switch|valve", text):
        t = "wiring_diagram"
    elif re.search(r"gas pressure|manifold|wc", text):
        t = "gas_system"
    out.append({"page": r.get("page"), "image_path": r.get("image_path"), "diagram_type": t})

out_json.write_text(json.dumps({"classifications": out}, indent=2))
print(str(out_json))
