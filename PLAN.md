# 大型书城找书路线系统 — 开发计划（已完成）

## 目标
- 用户：选楼层 → 书区 → 收银台，系统综合通道距离、扶梯/电梯/楼梯耗时与拥挤度
  推荐路线；返回自然语言分步指引（非节点编号），SVG 地图高亮。
- 管理员：维护书区节点与通道边（CRUD、拥挤度），即时落盘。

## 技术栈
- Node.js 原生 http（零依赖）+ JSON 文件存储；原生 HTML/CSS/JS + SVG
- Dijkstra（最优）+ Yen K 最短路径（最多 3 备选）

## 代价模型（等效秒）
- 通道 d/1.2 × [1.0/1.15/1.40/1.80]
- 扶梯 30 × [1.0/1.25/1.60/2.00]
- 电梯 (25+12×层差) × [1.0/1.20/1.50/1.90]
- 楼梯 12×层差 × [1.15/1.35/1.75/2.30]

## 交付物
scripts/seed.js · src/{server,store,graph,directions,geo}.js · public/{index.html,app.js,styles.css}
· test/api.test.js · data/graph.json · README.md

## 过程中修复的关键缺陷
1. 边 PUT 时补丁与缓存对象同引用，`delete patch.id` 误删真实 id
   → 补丁改为独立对象、updateXxx 内部用副本删除 id
2. Yen 候选拼接对短路径读取 undefined 边 → 增加长度/非空校验并跳过
3. 坐标按米直接换算导致距离虚大 → 增加 0.1 比例尺（src/geo.js）
4. 数据文件外部更新与内存缓存不一致 → fs.watch + mtime 判定自动重载
