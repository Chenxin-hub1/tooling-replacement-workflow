"""显式创建演示数据；只允许写入空数据库，不修改已有项目。"""
import argparse
import asyncio
import os
import sys
from datetime import timedelta
from pathlib import Path

parser = argparse.ArgumentParser(description='Create fictional tooling projects in an empty SQLite database.')
parser.add_argument('--database', required=True, type=Path)
args = parser.parse_args()
path = args.database.resolve()
path.parent.mkdir(parents=True, exist_ok=True)
os.environ['DATABASE_URL'] = f'sqlite+aiosqlite:///{path}'
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))

from app.dates import local_today
from app.db.migrations import migrate_database
from app.db.session import AsyncSessionLocal, engine
from app.engine.scheduler import schedule_project_actions
from app.models import Project
from app.schemas.project import ProjectCreate
from app.services.projects import create_project
from sqlalchemy import select

migrate_database(os.environ['DATABASE_URL'])


async def main():
    async with AsyncSessionLocal() as session:
        if (await session.scalars(select(Project.id).limit(1))).first():
            raise SystemExit('Refusing to add demo data: database already contains projects.')
        today=local_today()
        samples=[
            ('Steering wheel frame','Aschau','Steering Wheel','Magna Casting','Precision Works','Carrie Chen',120,6),
            ('Airbag cover tooling','Changchun','Airbag','Nordform','Evergreen Tooling','Daniel Wu',70,12),
            ('Seatbelt retractor housing','Częstochowa','Seatbelt','AutoCast','Novatech','Marta Kowalski',4,2),
            ('Passenger airbag bracket','Aschau','Airbag','FormaTech','Precision Works','Thomas Becker',0,0),
            ('Belt buckle assembly','Changchun','Seatbelt','Alloy Works','Novatech','Carrie Chen',210,31),
            ('Driver airbag inflator mount','Częstochowa','Airbag','Nordform','Precision Works','Daniel Wu',150,20),
        ]
        for index,(desc,plant,bu,cur,nw,owner,age,done) in enumerate(samples,1):
            project=await create_project(session,ProjectCreate(id=f'DEMO-{index:03d}',pn=f'ZF-400{index}21',desc=desc,plant=plant,bu=bu,cur=cur,nw=nw,owner=owner,reason='Demonstration project',created_at=today-timedelta(days=age),team={'BU Buyer':owner,'SDE':'Alex Morgan','PM':'Jamie Lee','ENG':'Robin Chen','SP/BU':'Morgan Reed','Accounting':'Taylor Kim'}))
            for action in project.actions[:done]:
                action.done_date=today-timedelta(days=2)
                action.value=action.done_date.isoformat() if 'date' in action.input_type.lower() else action.input_type.split(' / ')[-1] if ' / ' in action.input_type else f'DEMO-{index:03d}'
            schedule_project_actions(project.created_at,project.actions)
        await session.commit()
    await engine.dispose()
    print(f'Created 6 fictional demo projects in {path}')


asyncio.run(main())
