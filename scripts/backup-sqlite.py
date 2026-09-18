"""使用 SQLite 在线备份 API，包含 WAL 中已提交的数据。"""
import argparse
import sqlite3
from pathlib import Path

parser=argparse.ArgumentParser(description='Back up a SQLite database without copying a live WAL file.')
parser.add_argument('source',type=Path)
parser.add_argument('destination',type=Path)
args=parser.parse_args()
if not args.source.is_file():
    parser.error('Source database does not exist')
if args.destination.exists():
    parser.error('Destination already exists; choose a new backup filename')
args.destination.parent.mkdir(parents=True,exist_ok=True)
with sqlite3.connect(args.source.resolve().as_uri()+'?mode=ro',uri=True) as source:
    with sqlite3.connect(args.destination) as destination:
        source.backup(destination)
print(f'Backup written to {args.destination}')
