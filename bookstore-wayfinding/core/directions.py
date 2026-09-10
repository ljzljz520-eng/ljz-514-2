# -*- coding: utf-8 -*-
"""把图路径转成自然语言分步指引（不暴露节点编号）"""
import math

TURN_WORDS = {
    -2: "向左后方", -1: "左转", 0: "直行", 1: "右转", 2: "向右后方",
}


def _bearing(n1, n2):
    """同层方位角(度，北=0)。换层返回 None。"""
    if n1["floor"] != n2["floor"]:
        return None
    dx, dy = n2["x"] - n1["x"], n2["y"] - n1["y"]
    ang = math.degrees(math.atan2(dx, -dy))
    return (ang + 360) % 360


def _turn(prev_b, cur_b):
    """由前后方位角判断转向 -2..2"""
    if prev_b is None or cur_b is None:
        return 0
    delta = ((cur_b - prev_b + 540) % 360) - 180   # -180..180
    if -25 <= delta <= 25:
        return 0
    if 25 < delta <= 150:
        return 1
    if delta > 150:
        return 2
    if -150 <= delta < -25:
        return -1
    return -2


def _dir_word(b):
    if b is None:
        return ""
    sectors = ["正北", "东北", "正东", "东南", "正南", "西南", "正西", "西北"]
    return sectors[int((b + 22.5) // 45) % 8]


def _walk_step(nodes, edges, start_idx, end_idx, start_bearing, turning):
    """合并 start_idx..end_idx-1 的连续直行步行边（遇转弯已在外部断开）。
    turning: 相对上一段的转向码 -2..2；首段为 None。
    返回 (step, 结束方位角)"""
    seg_edges = edges[start_idx:end_idx]
    total = round(sum(e["distance_m"] for e in seg_edges), 1)
    b1 = _bearing(nodes[start_idx], nodes[start_idx + 1])
    b2 = _bearing(nodes[end_idx - 1], nodes[end_idx])
    corridor = seg_edges[0]["name"]

    parts = []
    if start_bearing is None and turning is None:
        parts.append(f"沿{corridor}向{_dir_word(b1)}方向")
    elif turning is None:
        parts.append(f"出梯后沿{corridor}向{_dir_word(b1)}方向前行")
    elif turning == 0:
        parts.append("保持直行，继续沿通道")
    else:
        parts.append(f"{TURN_WORDS[turning]}，转入{corridor}")
    parts.append(f"，步行约 {total:g} 米")
    instr = "".join(parts)

    worst = max((e["crowd_level"] for e in seg_edges), default=1)
    if worst >= 3:
        instr += "（该段人流较密，请慢行避让）"
    elif worst == 2 and start_bearing is None:
        instr += "（该通道人稍多）"

    return {
        "kind": "walk",
        "instruction": instr,
        "distance_m": total,
        "floor": nodes[end_idx]["floor"],
        "turn": turning or 0,
        "heading": _dir_word(b1),
        "crowd_level": worst,
        "from_code": nodes[start_idx]["code"],
        "to_code": nodes[end_idx]["code"],
        "edge_codes": [e["code"] for e in seg_edges],
        "floor_tag": f"{nodes[start_idx]['floor']}F",
    }, b2


def _vertical_step(nodes, edge, idx, returning):
    n_from, n_to = nodes[idx], nodes[idx + 1]
    up = n_to["floor"] > n_from["floor"]
    direction = "上行" if up else "下行"
    if edge["edge_type"] == "escalator":
        instr = (f"在{edge['name'].split(' ')[0]}搭乘自动扶梯{direction}，"
                 f"由 {n_from['floor']}F 到 {n_to['floor']}F，"
                 f"留意脚下、扶稳扶手带")
        kind = "escalator"
    else:
        instr = (f"在{edge['name'].split(' ')[0]}乘坐箱式电梯{direction}，"
                 f"按 {n_to['floor']} 层按钮，到达后出电梯")
        kind = "elevator"
    if edge["crowd_level"] >= 3:
        instr += "（当前排队人数较多）"
    return {
        "kind": kind,
        "instruction": instr,
        "distance_m": edge["distance_m"],
        "floor": n_to["floor"],
        "turn": 0,
        "from_code": n_from["code"],
        "to_code": n_to["code"],
        "edge_codes": [edge["code"]],
        "level_change": abs(n_to["floor"] - n_from["floor"]),
        "up": up,
    }, None  # 出梯后方位角重置


def _arrival_step(node, kind):
    type_hint = {
        "zone": f"，您要找的书区到了，可在本区书架前找书或请理货员协助",
        "cashier": "，收银台到了，请在此排队结账",
        "entrance": "，已回到出入口",
        "service": "，服务台到了",
    }.get(node["node_type"], "")
    if kind == "waypoint":
        prefix = "📍 第一站到达："
    elif kind == "final_zone":
        prefix = "🎉 目的地到达："
    else:
        prefix = "✅ 行程结束："
    return {
        "kind": "arrival",
        "arrival_kind": kind,
        "instruction": prefix + node["name"] + type_hint,
        "floor": node["floor"],
        "from_code": node["code"],
        "to_code": node["code"],
        "edge_codes": [],
    }


def build_steps(path_detail, waypoint_codes, start_label=None):
    """waypoint_codes: 除起点外的途经点 code 列表（最后为终点）"""
    nodes, edges = path_detail["nodes"], path_detail["edges"]
    steps = []

    start = nodes[0]
    first = (f"🧭 您的路线已规划完成：从「{start_label or start['name']}」出发"
             f"（{start['floor']}F），请按以下指引前进")
    steps.append({"kind": "start", "instruction": first,
                  "floor": start["floor"], "from_code": start["code"],
                  "to_code": start["code"], "edge_codes": []})

    bearing = None
    returning = False
    i = 0
    while i < len(edges):
        e = edges[i]
        if e["edge_type"] == "walkway":
            # 在连续步行边中：按"转弯"与"途经点"切分直行段
            seg_start = i
            seg_bearing = _bearing(nodes[i], nodes[i + 1])
            turning = None if bearing is None else _turn(bearing, seg_bearing)
            j = i + 1
            while j < len(edges) and edges[j]["edge_type"] == "walkway":
                nb = _bearing(nodes[j], nodes[j + 1])
                if _turn(seg_bearing, nb) != 0:
                    break  # 前方转弯，当前直行段到此结束
                if nodes[j]["code"] in waypoint_codes:
                    break  # 途经点
                j += 1
            step, seg_end_bearing = _walk_step(
                nodes, edges, seg_start, j, bearing, turning)
            steps.append(step)
            bearing = seg_end_bearing
            # 到达某途经点/终点
            at = nodes[j]
            if at["code"] in waypoint_codes:
                is_final = at["code"] == waypoint_codes[-1]
                if is_final:
                    steps.append(_arrival_step(
                        at, "final_zone" if at["node_type"] == "zone"
                        else "final"))
                else:
                    steps.append(_arrival_step(at, "waypoint"))
                    steps.append({
                        "kind": "start",
                        "instruction": f"↩️ 之后请从「{at['name']}」离开，"
                                       f"继续前往下一目的地",
                        "floor": at["floor"],
                        "from_code": at["code"], "to_code": at["code"],
                        "edge_codes": []})
                    returning = True
                    bearing = None
            i = j
        else:
            step, bearing = _vertical_step(nodes, e, i, returning)
            steps.append(step)
            at = nodes[i + 1]
            if at["code"] in waypoint_codes and at["code"] == waypoint_codes[-1]:
                steps.append(_arrival_step(at, "final"))
            i += 1

    # 摘要
    floors = path_detail["floors"]
    summary = (
        f"全程步行约 {path_detail['walk_m']:g} 米，"
        f"预计 {path_detail['est_seconds'] // 60} 分钟；"
        f"乘扶梯 {path_detail['escalator_times']} 次、"
        f"电梯 {path_detail['elevator_times']} 次；"
        f"经过楼层 {'/'.join(str(f)+'F' for f in floors)}"
    )
    return steps, summary
