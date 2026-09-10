// JSON 文件存储：读缓存 + 同步写穿透；外部改写数据文件时自动重载
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'graph.json');
let cache = null;
let lastLoadedMtime = 0;
let watchStarted = false;

function load() {
  if (cache) return cache;
  lastLoadedMtime = fs.statSync(DATA_FILE).mtimeMs;
  cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  startWatch();
  return cache;
}
function startWatch() {
  if (watchStarted) return;
  watchStarted = true;
  let debounce = null;
  fs.watch(DATA_FILE, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      let mtime;
      try { mtime = fs.statSync(DATA_FILE).mtimeMs; } catch (_) { return; }
      if (mtime === lastLoadedMtime) return; // 本进程自己的写入
      cache = null;
    }, 100);
  });
}
function persist() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2), 'utf8');
  lastLoadedMtime = fs.statSync(DATA_FILE).mtimeMs;
}
function reload() { cache = null; return load(); }

const getNodes = () => load().nodes;
const getEdges = () => load().edges;
const getNode = (id) => load().nodes.find(n => n.id === id) || null;

function nextNodeId() {
  let max = 0;
  for (const n of getNodes()) {
    const m = n.id.match(/^n(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'n' + (max + 1);
}
function nextEdgeId() {
  let max = 0;
  for (const e of getEdges()) {
    const m = e.id.match(/^e(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'e' + (max + 1);
}

function addNode(node) {
  const nodes = getNodes();
  if (!node.id || nodes.some(n => n.id === node.id)) delete node.id;
  if (!node.id) node.id = nextNodeId();
  nodes.push(node);
  persist();
  return node;
}
function updateNode(id, patch) {
  const node = getNode(id);
  if (!node) return null;
  const p = { ...patch };
  delete p.id;
  Object.assign(node, p);
  persist();
  return node;
}
function deleteNode(id) {
  const data = load();
  const i = data.nodes.findIndex(n => n.id === id);
  if (i < 0) return false;
  data.nodes.splice(i, 1);
  const before = data.edges.length;
  data.edges = data.edges.filter(e => e.a !== id && e.b !== id);
  persist();
  return { removedEdges: before - data.edges.length };
}
function addEdge(edge) {
  const edges = getEdges();
  if (!edge.id || edges.some(e => e.id === edge.id)) delete edge.id;
  if (!edge.id) edge.id = nextEdgeId();
  edges.push(edge);
  persist();
  return edge;
}
function updateEdge(id, patch) {
  const edge = getEdges().find(e => e.id === id);
  if (!edge) return null;
  const p = { ...patch };
  delete p.id;
  Object.assign(edge, p);
  persist();
  return edge;
}
function deleteEdge(id) {
  const data = load();
  const i = data.edges.findIndex(e => e.id === id);
  if (i < 0) return false;
  data.edges.splice(i, 1);
  persist();
  return true;
}

module.exports = {
  reload, getNodes, getEdges, getNode,
  addNode, updateNode, deleteNode,
  addEdge, updateEdge, deleteEdge,
};
