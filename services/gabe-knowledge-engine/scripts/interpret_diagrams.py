#!/usr/bin/env python3
import json, re, sys
from pathlib import Path

if len(sys.argv) < 3:
    print("usage: interpret_diagrams.py <work_dir> <out_json>")
    sys.exit(1)

work_dir = Path(sys.argv[1])
out_json = Path(sys.argv[2])
ocr = json.loads((work_dir / "ocr.json").read_text()).get("ocr", []) if (work_dir / "ocr.json").exists() else []
cls = json.loads((work_dir / "diagram_types.json").read_text()).get("classifications", []) if (work_dir / "diagram_types.json").exists() else []
by_img = {c.get("image_path"): c for c in cls}

out = []
for r in ocr:
    text = r.get("ocr_text") or ""
    numbers = re.findall(r"\d+(?:\s*1/2|\s*1/4|\s*3/4)?\s*(?:in|\"|mm|ft)", text.lower())
    lower = text.lower()
    vent = {}
    if "vertical" in lower and "horizontal" in lower:
      import re
      v = re.findall(r"(\d+(?:\.\d+)?)\s*(?:ft|feet)\s*vertical", lower)
      h = re.findall(r"(\d+(?:\.\d+)?)\s*(?:ft|feet)\s*horizontal", lower)
      if v: vent["max_vertical_ft"] = v[0]
      if h: vent["max_horizontal_ft"] = h[0]

    out.append({
      "page": r.get("page"),
      "image_path": r.get("image_path"),
      "diagram_type": by_img.get(r.get("image_path"), {}).get("diagram_type", "unknown"),
      "structured_data": {
        "measurements": numbers[:20],
        "vent_table": vent,
        "raw_ocr": text[:4000]
      }
    })

out_json.write_text(json.dumps({"diagrams": out}, indent=2))
print(str(out_json))
