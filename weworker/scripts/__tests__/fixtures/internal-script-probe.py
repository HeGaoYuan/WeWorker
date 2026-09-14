from __future__ import annotations

import json
import os
import sys


exit_code = int(sys.argv[1])
payload = {
    "args": sys.argv[2:],
    "cwd": os.getcwd(),
    "stdin": sys.stdin.read(),
    "env": {
        "PYTHONHOME": os.environ.get("PYTHONHOME"),
        "PYTHONPATH": os.environ.get("PYTHONPATH"),
        "PYTHONNOUSERSITE": os.environ.get("PYTHONNOUSERSITE"),
        "PYTHONDONTWRITEBYTECODE": os.environ.get("PYTHONDONTWRITEBYTECODE"),
        "WEBWRIGHT_HOME": os.environ.get("WEBWRIGHT_HOME"),
    },
}
print(json.dumps(payload, ensure_ascii=False))
raise SystemExit(exit_code)
