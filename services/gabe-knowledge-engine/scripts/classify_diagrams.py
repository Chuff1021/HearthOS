#!/usr/bin/env python3
import json, sys
from pathlib import Path

if len(sys.argv) < 3:
    print("usage: classify_diagrams.py <images_dir> <out_json>")
    sys.exit(1)

images_dir = Path(sys.argv[1])
out_json = Path(sys.argv[2])

# Stub classifier stage. Replace with layoutparser/detectron2 model.
out_json.write_text(json.dumps({"images_dir": str(images_dir), "classifications": []}, indent=2))
print(str(out_json))
