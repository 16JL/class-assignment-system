# -*- coding: utf-8 -*-
"""
数据库初始化脚本
================
用途：
  1. 从零创建数据库表结构（students / preferences / admins / settings / sessions / operation_logs）
  2. 写入默认的填报时间设置
  3. 创建演示用管理员账号
  4. 可选：从 Excel 花名册批量导入学生（路径通过命令行参数传入）

用法：
    python init_db.py                       # 仅初始化结构 + 演示账号
    python init_db.py roster.xlsx           # 初始化并导入指定花名册

花名册格式要求（Excel）：
    第 1 行为表头，第 1 列单元格内容为班级名称
    第 2 列为学号，第 3 列为姓名
    学号第 5-6 位为专业代码：10 = 大数据，09 = 云计算
"""

import sqlite3
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, '..', 'data', 'class_assignment.db')

# 默认填报时间窗口（部署后可在管理员端「时间设置」中修改）
DEFAULT_SETTINGS = [
    ('start_time', '2026-01-01T00:00:00'),
    ('end_time', '2027-12-31T23:59:00'),
    ('registration_open', '1'),
]

# 演示管理员账号（部署到生产环境后请立即修改密码）
DEMO_ADMINS = [
    ('admin', 'admin123', '系统管理员', 'super', 'active'),
    ('teacher01', 'teacher123', '示例教师账号', 'normal', 'active'),
]

SCHEMA_SQL = '''
CREATE TABLE IF NOT EXISTS students (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id      TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    password        TEXT NOT NULL,
    major           TEXT NOT NULL,
    class_name      TEXT NOT NULL,
    original_class  TEXT NOT NULL,
    first_login     INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now','localtime')),
    gender          TEXT DEFAULT '男',
    failed_attempts INTEGER DEFAULT 0,
    locked          INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS preferences (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  TEXT NOT NULL UNIQUE,
    choice1     TEXT,
    choice2     TEXT,
    choice3     TEXT,
    choice4     TEXT,
    updated_at  TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (student_id) REFERENCES students(student_id)
);

CREATE TABLE IF NOT EXISTS admins (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT UNIQUE NOT NULL,
    password     TEXT NOT NULL,
    display_name TEXT,
    role         TEXT DEFAULT 'normal',
    status       TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    token      TEXT UNIQUE,
    user_type  TEXT,
    user_id    TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    expires_at TEXT
);

CREATE TABLE IF NOT EXISTS operation_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id   TEXT,
    action     TEXT,
    detail     TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
'''


def init_schema(conn):
    conn.executescript(SCHEMA_SQL)


def insert_defaults(conn):
    c = conn.cursor()
    for k, v in DEFAULT_SETTINGS:
        c.execute('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', (k, v))
    for u, p, n, role, st in DEMO_ADMINS:
        c.execute(
            'INSERT OR IGNORE INTO admins (username, password, display_name, role, status) '
            'VALUES (?, ?, ?, ?, ?)', (u, p, n, role, st))
    conn.commit()


def import_roster(conn, xls_path):
    """从 Excel 花名册导入学生。需要 pandas + openpyxl。"""
    try:
        import pandas as pd
    except ImportError:
        print('[跳过] 未安装 pandas，无法导入花名册。')
        print('       如需导入请先执行: pip install pandas openpyxl')
        return 0

    if not os.path.exists(xls_path):
        print(f'[跳过] 花名册不存在: {xls_path}')
        return 0

    c = conn.cursor()
    inserted = 0
    xls = pd.ExcelFile(xls_path)
    for sheet in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet)
        if df.shape[1] < 3:
            continue
        class_name = str(df.columns[0]).strip()
        for _, row in df.iterrows():
            sid = str(row.iloc[1]).strip() if pd.notna(row.iloc[1]) else ''
            name = str(row.iloc[2]).strip() if pd.notna(row.iloc[2]) else ''
            if not sid or name in ('学号', 'nan', '') or not name:
                continue
            # 学号第 5-6 位为专业代码
            major_code = sid[4:6] if len(sid) >= 6 else ''
            major = '大数据' if major_code == '10' else '云计算' if major_code == '09' else '未知'
            original_class = class_name.replace('软件工程系', '').replace(' ', '')
            cur = c.execute(
                'INSERT OR IGNORE INTO students '
                '(student_id, name, password, major, class_name, original_class, first_login) '
                'VALUES (?, ?, ?, ?, ?, ?, 1)',
                (sid, name, sid, major, original_class, original_class))
            inserted += cur.rowcount
    conn.commit()
    return inserted


def main():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)

    init_schema(conn)
    insert_defaults(conn)
    print(f'[1/2] 表结构与默认设置已就绪 -> {DB_PATH}')

    xls_path = sys.argv[1] if len(sys.argv) > 1 else None
    if xls_path:
        n = import_roster(conn, xls_path)
        print(f'[2/2] 从花名册导入学生 {n} 人')
    else:
        print('[2/2] 未指定花名册，跳过导入（用法: python init_db.py <花名册.xlsx>）')

    conn.close()
    print('数据库初始化完成。')


if __name__ == '__main__':
    main()
