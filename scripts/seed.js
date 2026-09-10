// 生成 data/graph.json：4 层大型书城平面图数据
// 坐标：每层 1000 x 700 画布，0.1 单位 = 1 米（见 src/geo.js）
const fs = require('fs');
const path = require('path');
const { corridorMeters } = require('../src/geo');

const nodes = [];
const edges = [];
let edgeSeq = 1;

function addNode(id, floor, type, name, x, y) {
  nodes.push({ id, floor, type, name, x: Math.round(x), y: Math.round(y) });
}
// 由 id 稳定生成拥挤度（管理员之后可改）
function crowdOf(key) {
  let h = 2166136261;
  for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const r = ((h >>> 0) % 1000) / 1000;
  if (r < 0.34) return 0;
  if (r < 0.66) return 1;
  if (r < 0.9) return 2;
  return 3;
}
function dist(a, b) {
  const na = nodes.find(n => n.id === a);
  const nb = nodes.find(n => n.id === b);
  return corridorMeters(na, nb);
}
function cor(a, b, wayName) {
  edges.push({
    id: 'e' + edgeSeq++, type: 'corridor', a, b,
    distance: dist(a, b), crowd: crowdOf(a + '>' + b + wayName),
    wayName: wayName || ''
  });
}
function vert(type, a, b) {
  edges.push({ id: 'e' + edgeSeq++, type, a, b, distance: 6, crowd: crowdOf(type + a + b), wayName: '' });
}

// 7 个通道交汇枢纽
const J = {
  s:  [500, 620, '南口'],
  n:  [500, 100, '北口'],
  w:  [180, 360, '西口'],
  e:  [820, 360, '东口'],
  c:  [500, 360, '中庭'],
  nw: [250, 180, '西北口'],
  ne: [750, 180, '东北口'],
};
// 11 条主通道（带名称），构成多环路
const RING = [
  ['s','c','主通道'], ['c','n','主通道'],
  ['w','c','西通道'], ['c','e','东通道'],
  ['w','nw','西北通道'], ['nw','n','西北通道'],
  ['n','ne','东北通道'], ['ne','e','东北通道'],
  ['s','w','西南通道'], ['e','s','东南通道'],
  ['nw','ne','北通道'],
];
const FLOOR_ZONES = {
  1: [
    ['newbooks', '新书推荐区', 300, 290, 'nw'],
    ['culture',  '文创精品区', 700, 290, 'ne'],
    ['cafe',     '咖啡阅读区', 120, 480, 'w'],
  ],
  2: [
    ['lit', '文学区',     300, 290, 'nw'],
    ['his', '历史地理区', 700, 290, 'ne'],
    ['phi', '哲学社科区', 120, 250, 'w'],
    ['eco', '经济管理区', 880, 250, 'e'],
  ],
  3: [
    ['com', '计算机区',   300, 290, 'nw'],
    ['sci', '科学技术区', 700, 290, 'ne'],
    ['art', '艺术设计区', 120, 250, 'w'],
    ['med', '音乐影视区', 880, 250, 'e'],
  ],
  4: [
    ['kid', '少儿区',     300, 290, 'nw'],
    ['pic', '绘本区',     700, 290, 'ne'],
    ['edu', '教辅考试区', 120, 250, 'w'],
    ['toy', '文具玩具区', 880, 250, 'e'],
  ],
};

for (let f = 1; f <= 4; f++) {
  for (const [k, [x, y, nm]] of Object.entries(J)) {
    addNode(`f${f}-j-${k}`, f, 'junction', `${f}楼${nm}`, x, y);
  }
  for (const [p, q, wn] of RING) cor(`f${f}-j-${p}`, `f${f}-j-${q}`, wn);
  for (const [zid, zname, zx, zy, attach] of FLOOR_ZONES[f]) {
    const id = `f${f}-${zid}`;
    addNode(id, f, 'zone', zname, zx, zy);
    cor(id, `f${f}-j-${attach}`, zname + '通道');
  }
  addNode(`f${f}-esc`, f, 'escalator', `${f}楼东厅扶梯`, 895, 320);
  addNode(`f${f}-ele`, f, 'elevator', `${f}楼西侧电梯厅`, 105, 320);
  addNode(`f${f}-st`,  f, 'stairs',   `${f}楼北楼梯口`,  500, 55);
  cor(`f${f}-esc`, `f${f}-j-e`, '扶梯通道');
  cor(`f${f}-ele`, `f${f}-j-w`, '电梯厅通道');
  cor(`f${f}-st`,  `f${f}-j-n`, '楼梯口通道');
}

// F1 特有：入口、服务台、两个收银台
addNode('f1-entrance', 1, 'entrance', '书城正门入口', 500, 690);
addNode('f1-info',     1, 'info',     '一楼服务台',     380, 575);
addNode('f1-cash-a',   1, 'cashier',  '收银台A（南厅）', 430, 640);
addNode('f1-cash-b',   1, 'cashier',  '收银台B（东厅）', 570, 640);
cor('f1-entrance', 'f1-j-s', '入口大厅');
cor('f1-info', 'f1-j-s', '服务台通道');
cor('f1-cash-a', 'f1-j-s', '南厅通道');
cor('f1-cash-b', 'f1-j-s', '东厅通道');

// 跨层连接（相邻层，双向边）
for (let f = 1; f < 4; f++) {
  vert('escalator', `f${f}-esc`, `f${f + 1}-esc`);
  vert('elevator',  `f${f}-ele`, `f${f + 1}-ele`);
  vert('stairs',    `f${f}-st`,  `f${f + 1}-st`);
}

const out = { nodes, edges };
fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'data', 'graph.json'),
  JSON.stringify(out, null, 2), 'utf8');
console.log(`seed 完成：节点 ${nodes.length} 个，边 ${edges.length} 条`);
