# -*- coding: utf-8 -*-
"""书城初始拓扑数据
节点类型 node_type: entrance / zone / cashier / escalator / elevator /
                   junction(通道交叉口) / hallway / service
边类型 edge_type: walkway / escalator / elevator
拥挤度 crowd_level: 1 畅通  2 一般  3 拥挤
坐标 x,y: 同一楼层平面坐标(像素，用于画图与估算步行距离)
"""

# (code, name, floor, node_type, x, y, crowd_level)
NODES = [
    # ---------------- 1F ----------------
    ("f1_entrance",  "1F 正门入口",   1, "entrance",  500, 600, 2),
    ("f1_lobby",     "一层中庭",      1, "hallway",   500, 500, 2),
    ("f1_service",   "服务台",        1, "service",   380, 430, 1),
    ("f1_cashier",   "一层收银台",    1, "cashier",   640, 430, 3),
    ("f1_literature","文学区",        1, "zone",      200, 180, 2),
    ("f1_history",   "历史区",        1, "zone",      360, 180, 2),
    ("f1_philosophy","哲学社科区",    1, "zone",      520, 180, 1),
    ("f1_bestseller","畅销榜区",      1, "zone",      680, 180, 3),
    ("f1_newbook",   "新书推荐区",    1, "zone",      840, 180, 2),
    ("f1_west_esc",  "西扶梯·1层",   1, "escalator", 100, 380, 2),
    ("f1_west_elev", "西电梯·1层",   1, "elevator",  100, 420, 1),
    ("f1_east_esc",  "东扶梯·1层",   1, "escalator", 900, 380, 2),
    ("f1_east_elev", "东电梯·1层",   1, "elevator",  900, 420, 1),
    ("f1_cw",        "一层西通道口",  1, "junction",  260, 380, 1),
    ("f1_cc",        "一层主通道口",  1, "junction",  500, 380, 2),
    ("f1_ce",        "一层东通道口",  1, "junction",  740, 380, 1),
    ("f1_j1",        "文学历史岔口",  1, "junction",  280, 300, 1),
    ("f1_j2",        "社科岔口",      1, "junction",  500, 300, 1),
    ("f1_j3",        "畅销新书岔口",  1, "junction",  760, 300, 2),
    # ---------------- 2F ----------------
    ("f2_cashier",   "二层收银台",    2, "cashier",   500, 520, 2),
    ("f2_life",      "生活美学区",    2, "zone",      200, 160, 1),
    ("f2_tech",      "科技计算机区",  2, "zone",      400, 160, 2),
    ("f2_medical",   "医学健康区",    2, "zone",      600, 160, 1),
    ("f2_econ",      "经济管理区",    2, "zone",      800, 160, 2),
    ("f2_children",  "童书区",        2, "zone",      260, 520, 3),
    ("f2_edu",       "教辅考试区",    2, "zone",      740, 520, 3),
    ("f2_west_esc",  "西扶梯·2层",   2, "escalator", 100, 380, 2),
    ("f2_west_elev", "西电梯·2层",   2, "elevator",  100, 420, 1),
    ("f2_east_esc",  "东扶梯·2层",   2, "escalator",  900, 380, 2),
    ("f2_east_elev", "东电梯·2层",   2, "elevator",  900, 420, 1),
    ("f2_cw",        "二层西通道口",  2, "junction",  260, 380, 1),
    ("f2_cc",        "二层主通道口",  2, "junction",  500, 380, 2),
    ("f2_ce",        "二层东通道口",  2, "junction",  740, 380, 1),
    ("f2_j1",        "生活科技岔口",  2, "junction",  300, 300, 1),
    ("f2_j2",        "医学经管岔口",  2, "junction",  700, 300, 1),
    # ---------------- 3F ----------------
    ("f3_cashier",   "三层收银台",    3, "cashier",   780, 520, 2),
    ("f3_art",       "艺术设计区",    3, "zone",      220, 160, 2),
    ("f3_music",     "音乐音像区",    3, "zone",      420, 160, 1),
    ("f3_foreign",   "外文书区",      3, "zone",      620, 160, 1),
    ("f3_anime",     "二次元专区",    3, "zone",      820, 160, 3),
    ("f3_stationery","文具文创区",    3, "zone",      260, 520, 2),
    ("f3_cafe",      "阅读咖啡区",    3, "zone",      560, 520, 2),
    ("f3_west_esc",  "西扶梯·3层",   3, "escalator", 100, 380, 2),
    ("f3_west_elev", "西电梯·3层",   3, "elevator",  100, 420, 1),
    ("f3_east_esc",  "东扶梯·3层",   3, "escalator",  900, 380, 2),
    ("f3_east_elev", "东电梯·3层",   3, "elevator",  900, 420, 1),
    ("f3_cw",        "三层西通道口",  3, "junction",  260, 380, 1),
    ("f3_cc",        "三层主通道口",  3, "junction",  500, 380, 2),
    ("f3_ce",        "三层东通道口",  3, "junction",  740, 380, 1),
    ("f3_j1",        "艺术音乐岔口",  3, "junction",  320, 300, 1),
    ("f3_j2",        "外文二次元岔口",3, "junction",  720, 300, 1),
]

# (code, from_code, to_code, edge_type, name, distance_m, level_change, crowd_level)
# distance_m 为 None 时按同层坐标自动估算
EDGES = [
    # ===== 1F 主通道(东西向) =====
    ("e1_we_cw",  "f1_west_esc", "f1_cw",  "walkway", "一层主通道", None, 0, 2),
    ("e1_cw_cc",  "f1_cw",       "f1_cc",  "walkway", "一层主通道", None, 0, 2),
    ("e1_cc_ce",  "f1_cc",       "f1_ce",  "walkway", "一层主通道", None, 0, 2),
    ("e1_ce_ee",  "f1_ce",       "f1_east_esc", "walkway", "一层主通道", None, 0, 1),
    # 入口-中庭-主通道
    ("e1_in_lb",  "f1_entrance", "f1_lobby", "walkway", "入口大厅通道", None, 0, 2),
    ("e1_lb_cc",  "f1_lobby",    "f1_cc",  "walkway", "中庭连廊", None, 0, 2),
    ("e1_lb_sv",  "f1_lobby",    "f1_service", "walkway", "服务台通道", None, 0, 1),
    ("e1_lb_cs",  "f1_lobby",    "f1_cashier", "walkway", "收银台通道", None, 0, 3),
    # 电梯-扶梯厅
    ("e1_wel_we", "f1_west_elev","f1_west_esc", "walkway", "西侧垂直交通厅", None, 0, 1),
    ("e1_eel_ee", "f1_east_elev","f1_east_esc", "walkway", "东侧垂直交通厅", None, 0, 1),
    # 北侧书区岔路
    ("e1_cw_j1",  "f1_cw",  "f1_j1", "walkway", "北侧书区通道", None, 0, 1),
    ("e1_cc_j2",  "f1_cc",  "f1_j2", "walkway", "北侧书区通道", None, 0, 1),
    ("e1_ce_j3",  "f1_ce",  "f1_j3", "walkway", "北侧书区通道", None, 0, 2),
    ("e1_j1_lit", "f1_j1",  "f1_literature", "walkway", "文学区通道", None, 0, 2),
    ("e1_j1_his", "f1_j1",  "f1_history",    "walkway", "历史区通道", None, 0, 2),
    ("e1_j2_phi", "f1_j2",  "f1_philosophy", "walkway", "哲学社科区通道", None, 0, 1),
    ("e1_j3_bes", "f1_j3",  "f1_bestseller", "walkway", "畅销榜区通道", None, 0, 3),
    ("e1_j3_new", "f1_j3",  "f1_newbook",    "walkway", "新书区通道", None, 0, 2),

    # ===== 2F 主通道 =====
    ("e2_we_cw",  "f2_west_esc", "f2_cw",  "walkway", "二层主通道", None, 0, 2),
    ("e2_cw_cc",  "f2_cw",       "f2_cc",  "walkway", "二层主通道", None, 0, 2),
    ("e2_cc_ce",  "f2_cc",       "f2_ce",  "walkway", "二层主通道", None, 0, 2),
    ("e2_ce_ee",  "f2_ce",       "f2_east_esc", "walkway", "二层主通道", None, 0, 1),
    ("e2_wel_we", "f2_west_elev","f2_west_esc", "walkway", "西侧垂直交通厅", None, 0, 1),
    ("e2_eel_ee", "f2_east_elev","f2_east_esc", "walkway", "东侧垂直交通厅", None, 0, 1),
    ("e2_cw_j1",  "f2_cw",  "f2_j1", "walkway", "北侧书区通道", None, 0, 1),
    ("e2_ce_j2",  "f2_ce",  "f2_j2", "walkway", "北侧书区通道", None, 0, 1),
    ("e2_j1_life","f2_j1",  "f2_life",    "walkway", "生活美学区通道", None, 0, 1),
    ("e2_j1_tech","f2_j1",  "f2_tech",    "walkway", "科技区通道", None, 0, 2),
    ("e2_j2_med", "f2_j2",  "f2_medical", "walkway", "医学区通道", None, 0, 1),
    ("e2_j2_econ","f2_j2",  "f2_econ",    "walkway", "经管区通道", None, 0, 2),
    # 南侧
    ("e2_cw_chi", "f2_cw",  "f2_children", "walkway", "童书区通道", None, 0, 3),
    ("e2_ce_edu", "f2_ce",  "f2_edu",      "walkway", "教辅区通道", None, 0, 3),
    ("e2_cc_cs",  "f2_cc",  "f2_cashier",  "walkway", "二层收银通道", None, 0, 2),

    # ===== 3F 主通道 =====
    ("e3_we_cw",  "f3_west_esc", "f3_cw",  "walkway", "三层主通道", None, 0, 2),
    ("e3_cw_cc",  "f3_cw",       "f3_cc",  "walkway", "三层主通道", None, 0, 2),
    ("e3_cc_ce",  "f3_cc",       "f3_ce",  "walkway", "三层主通道", None, 0, 2),
    ("e3_ce_ee",  "f3_ce",       "f3_east_esc", "walkway", "三层主通道", None, 0, 1),
    ("e3_wel_we", "f3_west_elev","f3_west_esc", "walkway", "西侧垂直交通厅", None, 0, 1),
    ("e3_eel_ee", "f3_east_elev","f3_east_esc", "walkway", "东侧垂直交通厅", None, 0, 1),
    ("e3_cw_j1",  "f3_cw",  "f3_j1", "walkway", "北侧书区通道", None, 0, 1),
    ("e3_ce_j2",  "f3_ce",  "f3_j2", "walkway", "北侧书区通道", None, 0, 1),
    ("e3_j1_art", "f3_j1",  "f3_art",     "walkway", "艺术区通道", None, 0, 2),
    ("e3_j1_mus", "f3_j1",  "f3_music",   "walkway", "音乐区通道", None, 0, 1),
    ("e3_j2_for", "f3_j2",  "f3_foreign", "walkway", "外文书区通道", None, 0, 1),
    ("e3_j2_ani", "f3_j2",  "f3_anime",   "walkway", "二次元区通道", None, 0, 3),
    # 南侧
    ("e3_cw_sta", "f3_cw",  "f3_stationery", "walkway", "文创区通道", None, 0, 2),
    ("e3_cc_cafe","f3_cc",  "f3_cafe",       "walkway", "咖啡区通道", None, 0, 2),
    ("e3_ce_cs",  "f3_ce",  "f3_cashier",    "walkway", "三层收银通道", None, 0, 2),

    # ===== 垂直交通(扶梯 / 电梯) =====
    ("v_wesc_12", "f1_west_esc", "f2_west_esc", "escalator", "西扶梯 1↔2层", 20, 1, 2),
    ("v_wesc_23", "f2_west_esc", "f3_west_esc", "escalator", "西扶梯 2↔3层", 20, 1, 2),
    ("v_eesc_12", "f1_east_esc", "f2_east_esc", "escalator", "东扶梯 1↔2层", 20, 1, 2),
    ("v_eesc_23", "f2_east_esc", "f3_east_esc", "escalator", "东扶梯 2↔3层", 20, 1, 2),
    ("v_wele_12", "f1_west_elev","f2_west_elev","elevator",  "西电梯 1↔2层", 20, 1, 1),
    ("v_wele_23", "f2_west_elev","f3_west_elev","elevator",  "西电梯 2↔3层", 20, 1, 1),
    ("v_eeele_12","f1_east_elev","f2_east_elev","elevator",  "东电梯 1↔2层", 20, 1, 1),
    ("v_eeele_23","f2_east_elev","f3_east_elev","elevator",  "东电梯 2↔3层", 20, 1, 1),
]
