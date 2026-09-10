# -*- coding: utf-8 -*-
"""图模型 + 加权 Dijkstra 路径规划

权重以"等效秒数"计：
  walkway   : 距离 / 步速 × 拥挤系数
  escalator : 每层固定乘梯时间 × 拥挤系数 × 偏好系数
  elevator  : 每层固定时间 + 呼梯等待 × 拥挤系数 × 偏好系数
"""
import heapq

WALK_SPEED = 1.2          # m/s
ESC_PER_FLOOR = 22.0      # 扶梯每层秒数
ELEV_PER_FLOOR = 14.0     # 电梯运行每层秒数
ELEV_WAIT = 18.0          # 呼梯等待秒数

# 三种偏好方案：拥挤系数(1/2/3级) + 垂直交通偏好系数
PROFILES = {
    "balanced": {
        "label": "综合推荐",
        "crowd": {1: 1.0, 2: 1.5, 3: 2.3},
        "esc": 1.0, "elev": 1.0,
        "desc": "兼顾距离与拥挤程度，自动选择更顺的扶梯/电梯",
    },
    "comfort": {
        "label": "人少舒适",
        "crowd": {1: 1.0, 2: 2.0, 3: 3.6},
        "esc": 1.15, "elev": 0.85,
        "desc": "优先避开拥挤通道，倾向乘坐更宽松的电梯",
    },
    "escalator": {
        "label": "扶梯优先",
        "crowd": {1: 1.0, 2: 1.4, 3: 2.0},
        "esc": 0.7, "elev": 4.0,
        "desc": "优先搭乘扶梯，距离最短化",
    },
}

NODE_CN = {
    "zone": "书区", "cashier": "收银台", "entrance": "入口",
    "escalator": "扶梯", "elevator": "电梯", "junction": "通道",
    "hallway": "中庭", "service": "服务台",
}


class Graph:
    def __init__(self, nodes, edges):
        self.nodes = {n["code"]: n for n in nodes}
        self.adj = {}
        self.edges = {}
        for e in edges:
            if not e.get("enabled", 1):
                continue
            self.edges[e["code"]] = e
            a, b = e["from_code"], e["to_code"]
            self.adj.setdefault(a, []).append((b, e["code"]))
            self.adj.setdefault(b, []).append((a, e["code"]))

    def edge_cost(self, e, profile, penalties=None):
        p = PROFILES[profile]
        crowd = p["crowd"].get(e["crowd_level"], 1.0)
        if e["edge_type"] == "walkway":
            cost = e["distance_m"] / WALK_SPEED * crowd
        elif e["edge_type"] == "escalator":
            cost = ESC_PER_FLOOR * max(1, e["level_change"]) * crowd * p["esc"]
        else:  # elevator
            cost = (ELEV_PER_FLOOR * max(1, e["level_change"]) + ELEV_WAIT) \
                * crowd * p["elev"]
        if penalties:
            cost += penalties.get(e["code"], 0.0)
        return cost

    def dijkstra(self, src, dst, profile, penalties=None):
        dist = {src: 0.0}
        prev = {}
        pq = [(0.0, src)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist.get(u, float("inf")):
                continue
            if u == dst:
                break
            for v, ecode in self.adj.get(u, []):
                nd = d + self.edge_cost(self.edges[ecode], profile, penalties)
                if nd < dist.get(v, float("inf")):
                    dist[v] = nd
                    prev[v] = (u, ecode)
                    heapq.heappush(pq, (nd, v))
        if dst not in dist:
            return None
        # 回溯
        node_codes, edge_codes = [dst], []
        cur = dst
        while cur != src:
            u, ecode = prev[cur]
            edge_codes.append(ecode)
            node_codes.append(u)
            cur = u
        node_codes.reverse()
        edge_codes.reverse()
        return {"nodes": node_codes, "edges": edge_codes, "weight": dist[dst]}

    def build_path_detail(self, found, profile):
        """把节点/边 code 序列填充为完整对象与统计"""
        nodes = [self.nodes[c] for c in found["nodes"]]
        edges = [self.edges[c] for c in found["edges"]]
        walk_m = sum(e["distance_m"] for e in edges if e["edge_type"] == "walkway")
        vert_m = sum(e["distance_m"] for e in edges if e["edge_type"] != "walkway")
        esc = sum(1 for e in edges if e["edge_type"] == "escalator")
        elev = sum(1 for e in edges if e["edge_type"] == "elevator")
        floors = sorted({n["floor"] for n in nodes})
        time_s = sum(self.edge_cost(e, profile) for e in edges)
        crowd_edges = [e["name"] for e in edges if e["crowd_level"] >= 3]
        return {
            "nodes": nodes,
            "edges": edges,
            "walk_m": round(walk_m, 1),
            "vertical_edges": esc + elev,
            "escalator_times": esc,
            "elevator_times": elev,
            "floors": floors,
            "est_seconds": int(round(time_s)),
            "raw_seconds": round(time_s, 2),
            "crowd_warnings": sorted(set(crowd_edges)),
        }


def plan_route(graph, waypoints, max_options=3):
    """waypoints: [起点, 书区, (收银台)]。对每种偏好分别分段 Dijkstra。
    返回去重后的多个方案。"""
    results = []
    seen = set()
    for profile in ("balanced", "comfort", "escalator"):
        all_nodes, all_edges, ok = [], [], True
        for i in range(len(waypoints) - 1):
            seg = graph.dijkstra(waypoints[i], waypoints[i + 1], profile)
            if not seg:
                ok = False
                break
            if i == 0:
                all_nodes.extend(seg["nodes"])
            else:
                all_nodes.extend(seg["nodes"][1:])
            all_edges.extend(seg["edges"])
        if not ok:
            continue
        key = tuple(all_edges)
        if key in seen:
            continue
        seen.add(key)
        found = {"nodes": all_nodes, "edges": all_edges, "weight": 0}
        detail = graph.build_path_detail(found, profile)
        detail["profile"] = profile
        detail["label"] = PROFILES[profile]["label"]
        detail["profile_desc"] = PROFILES[profile]["desc"]
        results.append(detail)
        if len(results) >= max_options:
            break
    # 按真实加权耗时排序；持平时综合推荐优先
    priority = {"balanced": 0, "comfort": 1, "escalator": 2}
    results.sort(key=lambda r: (r["raw_seconds"], priority[r["profile"]]))
    return results
