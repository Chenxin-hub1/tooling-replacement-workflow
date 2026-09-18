from datetime import UTC, date, datetime


def local_today() -> date:
    """按服务器本地时区取得业务日期，与规格中的系统日期一致。"""
    return datetime.now(UTC).astimezone().date()
