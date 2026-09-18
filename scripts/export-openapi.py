"""从后端应用生成接口契约；无需启动服务或连接数据库。"""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'backend'))
from app.main import app

(root / 'frontend' / 'openapi.json').write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2))
