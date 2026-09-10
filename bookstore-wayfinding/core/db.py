# -*- coding: utf-8 -*-
"""SQLite 数据库层：连接、初始化、播种、基础查询"""
import os
import math
import sqlite3

from data import seed

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "bookstore.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS nodes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    floor       INTEGER NOT NULL,
    node_type   TEXT NOT NULL,            -- entrance/zone/cashier/escalator/elevator/junction/hallway/service
    x           REAL NOT NULL,
    y           REAL NOT NULL,
    crowd_level INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS edges (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    code         TEXT UNIQUE NOT NULL,
    from_code    TEXT NOT NULL,
    to_code      TEXT NOT NULL,
    edge_type    TEXT NOT NULL,           -- walkway/escalator/elevator
    name         TEXT NOT NULL,
    distance_m   REAL NOT NULL,
    level_change INTEGER NOT NULL DEFAULT 0,  -- 跨越楼层数
    crowd_level  INTEGER NOT NULL DEFAULT 1,
    enabled      INTEGER NOT NULL DEFAULT 1
);
"""


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _auto_distance(a, b):
    """同层节点按坐标估算(像素 -> 米，比例 1px = 0.25m)"""
    ax, ay, af = a
    bx, by, bf = b
    if af == bf:
        return round(math.hypot(ax - bx, ay - by) * 0.25, 1)
    return 20.0  # 垂直交通默认


def init_db(force=False):
    if force and os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_conn()
    try:
        conn.executescript(SCHEMA)
        empty = conn.execute("SELECT COUNT(*) c FROM nodes").fetchone()["c"] == 0
        if empty:
            _seed(conn)
        conn.commit()
    finally:
        conn.close()


def _seed(conn):
    for code, name, floor, ntype, x, y, crowd in seed.NODES:
        conn.execute(
            "INSERT INTO nodes(code,name,floor,node_type,x,y,crowd_level) "
            "VALUES(?,?,?,?,?,?,?)",
            (code, name, floor, ntype, x, y, crowd),
        )
    pos = {r[0]: (r[4], r[5], r[2]) for r in seed.NODES}
    for code, fc, tc, etype, name, dist, lvl, crowd in seed.EDGES:
        if dist is None:
            dist = _auto_distance(pos[fc], pos[tc])
        conn.execute(
            "INSERT INTO edges(code,from_code,to_code,edge_type,name,distance_m,"
            "level_change,crowd_level,enabled) VALUES(?,?,?,?,?,?,?,?,1)",
            (code, fc, tc, etype, name, dist, lvl, crowd),
        )


# ---------------- 查询 ----------------
def list_nodes(floor=None, node_type=None):
    conn = get_conn()
    try:
        sql = "SELECT * FROM nodes WHERE 1=1"
        args = []
        if floor is not None:
            sql += " AND floor=?"
            args.append(floor)
        if node_type:
            sql += " AND node_type=?"
            args.append(node_type)
        sql += " ORDER BY floor, y, x"
        return [dict(r) for r in conn.execute(sql, args)]
    finally:
        conn.close()


def get_node_by_code(code):
    conn = get_conn()
    try:
        r = conn.execute("SELECT * FROM nodes WHERE code=?", (code,)).fetchone()
        return dict(r) if r else None
    finally:
        conn.close()


def list_edges(enabled_only=False):
    conn = get_conn()
    try:
        sql = "SELECT * FROM edges"
        if enabled_only:
            sql += " WHERE enabled=1"
        sql += " ORDER BY id"
        return [dict(r) for r in conn.execute(sql)]
    finally:
        conn.close()


def list_floors():
    conn = get_conn()
    try:
        return [r["floor"] for r in conn.execute(
            "SELECT DISTINCT floor FROM nodes ORDER BY floor")]
    finally:
        conn.close()
