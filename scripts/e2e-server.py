"""浏览器测试专用服务，生命周期内只使用临时数据库。"""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
# 默认 8011：本机的 8001 被常驻的其他容器占用；可用 E2E_PORT 覆盖（与 playwright.config.ts 一致）。
with tempfile.TemporaryDirectory(prefix='tooling-e2e-') as directory:
    env = dict(os.environ, DATABASE_URL=f'sqlite+aiosqlite:///{directory}/test.db')
    process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', os.environ.get('E2E_PORT', '8011')], cwd=root/'backend', env=env)
    try:
        process.wait()
    finally:
        process.terminate()
        process.wait(timeout=10)
