# -*- coding: utf-8 -*-
"""书城找书路线系统 —— 零依赖 HTTP 服务（标准库）"""
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from core import db
from core.pathfinder import Graph, plan_route
from core.directions import build_steps

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
MIME = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml"}


def _load_graph():
    return Graph(db.list_nodes(), db.list_edges(enabled_only=True))


# ---------------- 业务 API ----------------
def api_map():
    return {
        "floors": db.list_floors(),
        "nodes": db.list_nodes(),
        "edges": db.list_edges(),
    }


def api_plan(qs):
    def pick(k, d=None):
        return qs.get(k, [d])[0]
    floor = int(pick("floor", "1"))
    zone_code = pick("zone")
    cashier_code = pick("cashier") or None
    start_code = pick("start") or "f1_entrance"
    via_cashier = pick("via_cashier", "false") == "true"

    nodes_by_code = {n["code"]: n for n in db.list_nodes()}
    if zone_code not in nodes_by_code:
        raise ValueError("请选择目标书区")
    zone = nodes_by_code[zone_code]
    if zone["floor"] != floor:
        raise ValueError("书区与所选楼层不一致")

    # 收银台：显式选择优先；否则默认同层收银台
    cashier = None
    if cashier_code:
        cashier = nodes_by_code.get(cashier_code)
        if not cashier or cashier["node_type"] != "cashier":
            raise ValueError("收银台不存在")
    elif via_cashier:
        for n in db.list_nodes(floor=floor, node_type="cashier"):
            cashier = n
            break

    waypoints = [start_code, zone_code]
    wp_names = [zone["name"]]
    if cashier:
        waypoints.append(cashier["code"])
        wp_names.append(cashier["name"])

    graph = _load_graph()
    routes = plan_route(graph, waypoints)
    if not routes:
        raise ValueError("找不到可达路线（通道可能被管理员停用）")

    out_routes = []
    for r in routes:
        steps, summary = build_steps(r, waypoints[1:],
                                     nodes_by_code[start_code]["name"])
        out_routes.append({
            "profile": r["profile"], "label": r["label"],
            "profile_desc": r["profile_desc"],
            "walk_m": r["walk_m"], "est_seconds": r["est_seconds"],
            "escalator_times": r["escalator_times"],
            "elevator_times": r["elevator_times"],
            "floors": r["floors"],
            "crowd_warnings": r["crowd_warnings"],
            "node_codes": [n["code"] for n in r["nodes"]],
            "edge_codes": [e["code"] for e in r["edges"]],
            "steps": steps,
            "summary": summary,
        })

    return {
        "start": nodes_by_code[start_code],
        "target_zone": zone,
        "target_cashier": cashier,
        "waypoints": wp_names,
        "routes": out_routes,
    }


# ---------------- 管理员 API ----------------
VALID_NODE_TYPES = {"entrance", "zone", "cashier", "escalator",
                    "elevator", "junction", "hallway", "service"}
VALID_EDGE_TYPES = {"walkway", "escalator", "elevator"}


def _validate_node(b):
    for k in ("code", "name", "floor", "node_type", "x", "y"):
        if b.get(k) in (None, ""):
            raise ValueError(f"字段 {k} 不能为空")
    if not re.fullmatch(r"[a-zA-Z0-9_]+", b["code"]):
        raise ValueError("节点编码只能含字母数字下划线")
    if b["node_type"] not in VALID_NODE_TYPES:
        raise ValueError("节点类型非法")
    b["floor"] = int(b["floor"])
    b["x"], b["y"] = float(b["x"]), float(b["y"])
    b["crowd_level"] = int(b.get("crowd_level") or 1)
    if not (1 <= b["crowd_level"] <= 3):
        raise ValueError("拥挤度须为1-3")


def admin_save_node(b):
    _validate_node(b)
    conn = db.get_conn()
    try:
        conn.execute(
            "INSERT INTO nodes(code,name,floor,node_type,x,y,crowd_level) "
            "VALUES(:code,:name,:floor,:node_type,:x,:y,:crowd_level) "
            "ON CONFLICT(code) DO UPDATE SET name=:name,floor=:floor,"
            "node_type=:node_type,x=:x,y=:y,crowd_level=:crowd_level", b)
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


def admin_delete_node(code):
    conn = db.get_conn()
    try:
        used = conn.execute(
            "SELECT COUNT(*) c FROM edges WHERE from_code=? OR to_code=?",
            (code, code)).fetchone()["c"]
        if used:
            raise ValueError("该节点仍被通道引用，请先删除相关通道边")
        cur = conn.execute("DELETE FROM nodes WHERE code=?", (code,))
        conn.commit()
        if cur.rowcount == 0:
            raise ValueError("节点不存在")
    finally:
        conn.close()
    return {"ok": True}


def _validate_edge(b):
    for k in ("code", "from_code", "to_code", "edge_type", "name",
              "distance_m"):
        if b.get(k) in (None, ""):
            raise ValueError(f"字段 {k} 不能为空")
    if not re.fullmatch(r"[a-zA-Z0-9_]+", b["code"]):
        raise ValueError("通道编码只能含字母数字下划线")
    if b["edge_type"] not in VALID_EDGE_TYPES:
        raise ValueError("通道类型非法")
    if b["from_code"] == b["to_code"]:
        raise ValueError("起止节点不能相同")
    b["distance_m"] = float(b["distance_m"])
    if b["distance_m"] <= 0:
        raise ValueError("距离须大于0")
    b["level_change"] = int(b.get("level_change") or 0)
    b["crowd_level"] = int(b.get("crowd_level") or 1)
    if not (1 <= b["crowd_level"] <= 3):
        raise ValueError("拥挤度须为1-3")
    b["enabled"] = 1 if b.get("enabled", True) else 0


def admin_save_edge(b):
    _validate_edge(b)
    conn = db.get_conn()
    try:
        if not conn.execute("SELECT 1 FROM nodes WHERE code=?",
                            (b["from_code"],)).fetchone():
            raise ValueError("起点节点不存在")
        if not conn.execute("SELECT 1 FROM nodes WHERE code=?",
                            (b["to_code"],)).fetchone():
            raise ValueError("终点节点不存在")
        conn.execute(
            "INSERT INTO edges(code,from_code,to_code,edge_type,name,"
            "distance_m,level_change,crowd_level,enabled) VALUES(:code,"
            ":from_code,:to_code,:edge_type,:name,:distance_m,"
            ":level_change,:crowd_level,:enabled) "
            "ON CONFLICT(code) DO UPDATE SET from_code=:from_code,"
            "to_code=:to_code,edge_type=:edge_type,name=:name,"
            "distance_m=:distance_m,level_change=:level_change,"
            "crowd_level=:crowd_level,enabled=:enabled", b)
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


def admin_delete_edge(code):
    conn = db.get_conn()
    try:
        cur = conn.execute("DELETE FROM edges WHERE code=?", (code,))
        conn.commit()
        if cur.rowcount == 0:
            raise ValueError("通道不存在")
    finally:
        conn.close()
    return {"ok": True}


def admin_toggle_edge(body):
    conn = db.get_conn()
    try:
        conn.execute("UPDATE edges SET enabled=? WHERE code=?",
                     (0 if body.get("enabled") is False else 1,
                      body["code"]))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


# ---------------- HTTP 分发 ----------------
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, status=200):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _err(self, msg, status=400):
        self._json({"error": msg}, status)

    def _serve_static(self, path):
        if path == "/":
            path = "/index.html"
        fp = os.path.normpath(os.path.join(STATIC_DIR, path.lstrip("/")))
        if not fp.startswith(STATIC_DIR) or not os.path.isfile(fp):
            self.send_error(404)
            return
        ext = os.path.splitext(fp)[1]
        with open(fp, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path)
        path, qs = u.path, parse_qs(u.query)
        try:
            if path == "/api/map":
                return self._json(api_map())
            if path == "/api/plan":
                return self._json(api_plan(qs))
            if path.startswith("/api/"):
                return self._err("未知接口", 404)
            return self._serve_static(path)
        except ValueError as e:
            return self._err(str(e))
        except Exception as e:  # noqa
            return self._err("服务器错误: %s" % e, 500)

    def do_POST(self):
        u = urlparse(self.path)
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
            routes = {
                "/api/admin/node": lambda: admin_save_node(body),
                "/api/admin/edge": lambda: admin_save_edge(body),
                "/api/admin/edge/delete": lambda: admin_delete_edge(body.get("code")),
                "/api/admin/node/delete": lambda: admin_delete_node(body.get("code")),
                "/api/admin/edge/toggle": lambda: admin_toggle_edge(body),
            }
            if u.path not in routes:
                return self._err("未知接口", 404)
            return self._json(routes[u.path]())
        except ValueError as e:
            return self._err(str(e))
        except json.JSONDecodeError:
            return self._err("请求体不是合法 JSON")
        except Exception as e:  # noqa
            return self._json({"error": "服务器错误: %s" % e}, 500)


def main():
    db.init_db()
    port = int(os.environ.get("PORT", 8000))
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("书城找书路线系统已启动: http://localhost:%d" % port)
    print("用户端: /   管理后台: /admin.html")
    srv.serve_forever()


if __name__ == "__main__":
    main()
