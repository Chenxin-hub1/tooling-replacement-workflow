import hashlib
import json


def tool_identity(parts: list[str]) -> str:
    encoded = json.dumps(parts, ensure_ascii=False, separators=(",", ":")).encode()
    return "IMP-" + hashlib.sha256(encoded).hexdigest()[:24]
