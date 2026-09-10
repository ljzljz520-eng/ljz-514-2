// 书城找书路线系统 — HTTP 服务（零依赖）
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const store = require('./store');
const { kShortest } = require('./graph');
const { describe, optionTags } = require('./directions');
const { corridorMeters } = require('./geo');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = 'bookstore-admin';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const FLOORS = [
  { id: 1, name: '1 楼', theme: '入口 / 新书 / 文创 / 咖啡' },
  { id: 2, name: '2 楼', theme: '文学 / 历史 / 哲学 / 经管' },
  { id: 3, name: '3 楼', theme: '计算机 / 科技 / 艺术 / 音影' },
  { id: 4, name: '4 楼', theme: '少儿 / 绘本 / 教辅 / 文具玩具' },
];
const NODE_TYPES = {
  entrance: '入口', info: '服务台', cashier: '收银台', zone: '书区',
  junction: '通道节点', escalator: '扶梯', elevator: '电梯', stairs: '楼梯',
};
const EDGE_TYPES = { corridor: '通道', escalator: '扶梯', elevator: '电梯', stairs: '楼梯' };
const CROWD_LEVELS = [
  { value: 0, name: '畅通', color: '#16a34a' },
  { value: 1, name: '人较少', color: '#84cc16' },
  { value: 2, name: '拥挤', color: '#f59e0b' },
  { value: 3, name: '很挤', color: '#dc2626' },
];

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON 格式错误')); } });
    req.on('error', reject);
  });
}
function requireAdmin(req, res) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    send(res, 401, { error: '管理员密钥错误或缺失（请在管理页面登录）' });
    return false;
  }
  return true;
}

// ---------- 路线 ----------
function buildOptions(paths) {
  const raw = paths.map(p => {
    const d = describe(p);
    const crowdSum = p.edges.reduce((s, id) => {
      const e = store.getEdges().find(x => x.id === id);
      return s + (e ? (e.crowd || 0) : 0);
    }, 0);
    return { ...d, crowdSum, nodeIds: p.nodes, edgeIds: p.edges };
  });
  raw.forEach(o => { o.tags = optionTags(o, raw); });
  return raw;
}
function handleRoute(body, res) {
  const { floorId, zoneId, cashierId, entranceId } = body;
  const entrance = entranceId || 'f1-entrance';
  if (!floorId || !zoneId || !cashierId) return send(res, 400, { error: '请完整选择 楼层、书区、收银台' });
  const nodes = store.getNodes();
  const get = id => nodes.find(n => String(n.id) === String(id));
  const entNode = get(entrance), zoneNode = get(zoneId), cashNode = get(cashierId);
  if (!entNode) return send(res, 400, { error: '入口不存在' });
  if (!zoneNode) return send(res, 400, { error: '所选书区不存在' });
  if (!cashNode || cashNode.type !== 'cashier') return send(res, 400, { error: '所选收银台不存在' });
  if (zoneNode.floor !== Number(floorId)) return send(res, 400, { error: '书区与所选楼层不匹配' });

  const goPaths = kShortest(entNode.id, zoneNode.id, 3);
  const returnPaths = kShortest(zoneNode.id, cashNode.id, 3);
  if (!goPaths.length) return send(res, 404, { error: '找不到前往该书区的路线（图可能不连通）' });
  if (!returnPaths.length) return send(res, 404, { error: '找不到前往该收银台的路线' });

  send(res, 200, {
    query: {
      entrance: { id: entNode.id, name: entNode.name, floor: entNode.floor },
      zone: { id: zoneNode.id, name: zoneNode.name, floor: zoneNode.floor },
      cashier: { id: cashNode.id, name: cashNode.name, floor: cashNode.floor },
    },
    go: buildOptions(goPaths),
    back: buildOptions(returnPaths),
  });
}

// ---------- 校验 ----------
function validateNode(b) {
  if (!b.name || !String(b.name).trim()) return '名称必填';
  if (!FLOORS.some(f => f.id === Number(b.floor))) return '楼层必须为 1~4';
  if (!NODE_TYPES[b.type]) return '节点类型不合法';
  const x = Number(b.x), y = Number(b.y);
  if (!Number.isFinite(x) || x < 0 || x > 1000) return 'x 坐标需在 0~1000';
  if (!Number.isFinite(y) || y < 0 || y > 700) return 'y 坐标需在 0~700';
  return null;
}
function validateEdge(b) {
  if (!EDGE_TYPES[b.type]) return '边类型不合法';
  if (!store.getNode(b.a) || !store.getNode(b.b)) return '两个端点都必须存在';
  if (b.a === b.b) return '起点终点不能相同';
  if (![0, 1, 2, 3].includes(Number(b.crowd || 0))) return '拥挤度必须为 0~3';
  return null;
}
function fillEdgeDistance(edge) {
  const a = store.getNode(edge.a), b = store.getNode(edge.b);
  if (edge.type === 'corridor') {
    if (a.floor !== b.floor) return '通道必须位于同一楼层';
    if (!edge.distance) edge.distance = corridorMeters(a, b);
  } else {
    if (a.floor === b.floor) return '跨层交通不能在同一层';
    edge.distance = 6 * Math.abs(a.floor - b.floor);
  }
  return null;
}

// ---------- 静态文件 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const p = parsed.pathname;
  try {
    if (req.method === 'GET' && p === '/api/meta') {
      return send(res, 200, { floors: FLOORS, nodeTypes: NODE_TYPES, edgeTypes: EDGE_TYPES, crowdLevels: CROWD_LEVELS });
    }
    if (req.method === 'GET' && p === '/api/nodes') {
      let list = store.getNodes();
      if (parsed.query.floor) list = list.filter(n => n.floor === Number(parsed.query.floor));
      return send(res, 200, list);
    }
    if (req.method === 'GET' && p === '/api/edges') {
      let list = store.getEdges();
      if (parsed.query.floor) {
        const f = Number(parsed.query.floor);
        list = list.filter(e => {
          const a = store.getNode(e.a), b = store.getNode(e.b);
          return a && b && (a.floor === f || b.floor === f);
        });
      }
      return send(res, 200, list);
    }
    if (req.method === 'POST' && p === '/api/route') {
      return handleRoute(await readBody(req), res);
    }

    if (p.startsWith('/api/nodes') || p.startsWith('/api/edges')) {
      if (!requireAdmin(req, res)) return;
      const body = req.method === 'GET' ? {} : await readBody(req);

      if (p === '/api/nodes' && req.method === 'POST') {
        delete body.id;
        const err = validateNode(body);
        if (err) return send(res, 400, { error: err });
        const node = {
          floor: Number(body.floor), type: body.type,
          name: String(body.name).trim(), x: Number(body.x), y: Number(body.y)
        };
        return send(res, 201, store.addNode(node));
      }
      const nm = p.match(/^\/api\/nodes\/([^/]+)$/);
      if (nm && req.method === 'PUT') {
        delete body.id;
        const err = validateNode(body);
        if (err) return send(res, 400, { error: err });
        const node = store.updateNode(nm[1], {
          floor: Number(body.floor), type: body.type,
          name: String(body.name).trim(), x: Number(body.x), y: Number(body.y)
        });
        return node ? send(res, 200, node) : send(res, 404, { error: '节点不存在' });
      }
      if (nm && req.method === 'DELETE') {
        const r = store.deleteNode(nm[1]);
        return r ? send(res, 200, { ok: true, removedEdges: r.removedEdges }) : send(res, 404, { error: '节点不存在' });
      }

      if (p === '/api/edges' && req.method === 'POST') {
        delete body.id;
        const verr = validateEdge(body);
        if (verr) return send(res, 400, { error: verr });
        const edge = {
          type: body.type, a: body.a, b: body.b,
          distance: body.distance ? Number(body.distance) : null,
          crowd: Number(body.crowd || 0),
          wayName: body.wayName ? String(body.wayName).trim() : ''
        };
        const derr = fillEdgeDistance(edge);
        if (derr) return send(res, 400, { error: derr });
        return send(res, 201, store.addEdge(edge));
      }
      const em = p.match(/^\/api\/edges\/([^/]+)$/);
      if (em && req.method === 'PUT') {
        delete body.id;
        const verr = validateEdge(body);
        if (verr) return send(res, 400, { error: verr });
        if (!store.getEdges().some(x => x.id === em[1])) return send(res, 404, { error: '边不存在' });
        const patch = {
          type: body.type, a: body.a, b: body.b,
          crowd: Number(body.crowd || 0),
          wayName: body.wayName ? String(body.wayName).trim() : '',
          distance: body.distance ? Number(body.distance) : null,
        };
        const derr = fillEdgeDistance(patch);
        if (derr) return send(res, 400, { error: derr });
        const saved = store.updateEdge(em[1], patch);
        return send(res, 200, saved);
      }
      if (em && req.method === 'DELETE') {
        return store.deleteEdge(em[1]) ? send(res, 200, { ok: true }) : send(res, 404, { error: '边不存在' });
      }
      return send(res, 404, { error: '未知管理接口' });
    }

    if (p.startsWith('/api/')) return send(res, 404, { error: '接口不存在' });
    return serveStatic(req, res, p);
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`书城找书路线系统已启动: http://localhost:${PORT}`);
  console.log(`管理员密钥: ${ADMIN_KEY}`);
});
