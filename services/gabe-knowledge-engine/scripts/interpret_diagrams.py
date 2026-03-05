#!/usr/bin/env python3
import json, sys
from pathlib import Path

if len(sys.argv) < 3:
    print("usage: interpret_diagrams.py <work_dir> <out_json>")
    sys.exit(1)

work_dir = Path(sys.argv[1])
out_json = Path(sys.argv[2])

# Stub interpretation stage. Replace with vision model call.
out_json.write_text(json.dumps({"work_dir": str(work_dir), "diagrams": []}, indent=2))
print(str(out_json))
