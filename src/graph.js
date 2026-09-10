// 图建模、边权（距离 + 拥挤度折算）、Dijkstra、Yen K 最短路径
const store = require('./store');

const CROWD_FACTORS = {
  corridor:  [1.0, 1.15, 1.40, 1.80],
  escalator: [1.0, 1.25, 1.60, 2.00],
  elevator:  [1.0, 1.20, 1.50, 1.90],
  stairs:    [1.15, 1.35, 1.75, 2.30],
};

function baseSeconds(edge, u, v) {
  switch (edge.type) {
    case 'corridor':  return (edge.distance || 0) / 1.2;
    case 'escalator': return 30;
    case 'elevator':  return 25 + 12 * Math.abs(u.floor - v.floor);
    case 'stairs':    return 12 * Math.abs(u.floor - v.floor);
    default:          return (edge.distance || 0) / 1.2;
  }
}
function edgeSeconds(edge, u, v) {
  const f = CROWD_FACTORS[edge.type] || CROWD_FACTORS.corridor;
  return Math.round(baseSeconds(edge, u, v) * (f[edge.crowd || 0] || 1));
}
function edgeCost(edge, u, v) {
  return edgeSeconds(edge, u, v);
}

function buildAdj() {
  const nodes = store.getNodes();
  const edges = store.getEdges().filter(e => e.id); // 防御：跳过残缺边
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map(nodes.map(n => [n.id, []]));
  for (const e of edges) {
    if (!nodeMap.has(e.a) || !nodeMap.has(e.b)) continue;
    adj.get(e.a).push(e);
    adj.get(e.b).push(e);
  }
  return { adj, nodeMap };
}

// Dijkstra（支持屏蔽边/节点）
function dijkstra(source, target, blockedEdges, blockedNodes, adj, nodeMap) {
  blockedEdges = blockedEdges || new Set();
  blockedNodes = blockedNodes || new Set();
  if (!nodeMap.has(source) || !nodeMap.has(target)) return null;
  if (source === target) return { nodes: [source], edges: [], cost: 0 };

  const dist = new Map();
  const prev = new Map();
  const seen = new Set();
  for (const id of nodeMap.keys()) dist.set(id, Infinity);
  dist.set(source, 0);

  while (true) {
    let u = null, best = Infinity;
    for (const [id, d] of dist) {
      if (!seen.has(id) && !blockedNodes.has(id) && d < best) { best = d; u = id; }
    }
    if (u === null) break;
    if (u === target) break;
    seen.add(u);
    for (const e of adj.get(u) || []) {
      if (!e.id || blockedEdges.has(e.id)) continue;
      const v = e.a === u ? e.b : e.a;
      if (seen.has(v) || blockedNodes.has(v)) continue;
      const nd = dist.get(u) + edgeCost(e, nodeMap.get(u), nodeMap.get(v));
      if (nd < dist.get(v)) { dist.set(v, nd); prev.set(v, { node: u, edge: e.id }); }
    }
  }
  if (dist.get(target) === Infinity) return null;

  const nodesR = [target];
  const edgesR = [];
  let cur = target;
  while (cur !== source) {
    const p = prev.get(cur);
    edgesR.push(p.edge);
    nodesR.push(p.node);
    cur = p.node;
  }
  nodesR.reverse();
  edgesR.reverse();
  return { nodes: nodesR, edges: edgesR, cost: dist.get(target) };
}

// Yen K 最短路径（K 条互不相同的简单路径）
function kShortest(source, target, K) {
  const { adj, nodeMap } = buildAdj();
  const first = dijkstra(source, target, null, null, adj, nodeMap);
  if (!first) return [];
  const A = [first];
  let B = [];
  const allEdges = store.getEdges();

  const samePrefix = (p, root, len) => {
    for (let i = 0; i <= len; i++) if (p.nodes[i] !== root[i]) return false;
    return true;
  };

  for (let k = 1; k < K; k++) {
    const prevPath = A[k - 1];
    for (let i = 0; i < prevPath.nodes.length - 1; i++) {
      const spur = prevPath.nodes[i];
      const root = prevPath.nodes.slice(0, i + 1);
      const blockedEdges = new Set();
      const blockedNodes = new Set();

      for (const p of A) {
        if (p.edges.length > i && samePrefix(p, root, i) && p.edges[i]) {
          blockedEdges.add(p.edges[i]);
        }
      }
      for (let j = 0; j < i; j++) blockedNodes.add(root[j]);

      const spurPath = dijkstra(spur, target, blockedEdges, blockedNodes, adj, nodeMap);
      if (spurPath) {
        // root 有 i+1 个节点 ⇒ root 段有 i 条边
        const totalNodes = root.slice(0, -1).concat(spurPath.nodes);
        const totalEdges = prevPath.edges.slice(0, i).concat(spurPath.edges);
        if (totalEdges.some(x => !x) || totalEdges.length !== totalNodes.length - 1) continue;
        let cost = 0;
        for (let j = 0; j < totalEdges.length; j++) {
          const e = allEdges.find(x => x.id === totalEdges[j]);
          if (!e) { cost = Infinity; break; }
          cost += edgeCost(e, nodeMap.get(totalNodes[j]), nodeMap.get(totalNodes[j + 1]));
        }
        if (!isFinite(cost)) continue;
        const key = totalNodes.join('|');
        if (!B.some(b => b.nodes.join('|') === key) &&
            !A.some(a => a.nodes.join('|') === key)) {
          B.push({ nodes: totalNodes, edges: totalEdges, cost });
        }
      }
    }
    if (!B.length) break;
    B.sort((a, b) => a.cost - b.cost);
    A.push(B.shift());
  }
  return A;
}

module.exports = { kShortest, edgeSeconds, CROWD_FACTORS, buildAdj };
