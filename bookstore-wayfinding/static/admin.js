let MAP = null, nodes = [], edges = [];

async function api(path, method, body) {
  const opt = { method, headers: { "Content-Type": "application/json" } };
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch(path, opt);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "请求失败");
  return data;
}
function toast(msg, isErr) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (isErr ? " err" : "");
  t.style.display = "block";
  setTimeout(() => t.style.display = "none", 2200);
}
const TYPE_CN = { walkway: "步行通道", escalator: "扶梯", elevator: "电梯",
  zone: "书区", cashier: "收银台", entrance: "入口", escalator2: "",
  elevator2: "", junction: "通道口", hallway: "中庭", service: "服务台" };

async function reload() {
  MAP = await fetch("/api/map").then(r => r.json());
  nodes = MAP.nodes; edges = MAP.edges;
  renderNodes(); renderEdges(); fillNodeSelects();
}
function fillNodeSelects() {
  const opts = nodes.map(n => `<option value="${n.code}">${n.name} (${n.code})</option>`).join("");
  document.querySelector('[name=from_code]').innerHTML = opts;
  document.querySelector('[name=to_code]').innerHTML = opts;
}
function renderNodes() {
  const q = document.getElementById("nodeFilter").value.trim();
  const tb = document.querySelector("#nodeTable tbody");
  tb.innerHTML = nodes
    .filter(n => !q || n.name.includes(q) || n.code.includes(q))
    .map(n => `<tr>
      <td>${n.code}</td><td>${n.name}</td><td>${n.floor}F</td>
      <td><span class="tag" style="background:#7a6a56">${n.node_type}</span></td>
      <td><span class="tag crowd${n.crowd_level}">${["","畅通","一般","拥挤"][n.crowd_level]}</span></td>
      <td><button class="btn-sm btn-edit" data-code="${n.code}">编辑</button>
          <button class="btn-sm btn-del" data-code="${n.code}">删除</button></td></tr>`).join("");
  tb.querySelectorAll(".btn-edit").forEach(b => b.onclick = () => editNode(b.dataset.code));
  tb.querySelectorAll(".btn-del").forEach(b => b.onclick = () => delNode(b.dataset.code));
}
function renderEdges() {
  const nm = Object.fromEntries(nodes.map(n => [n.code, n]));
  const tb = document.querySelector("#edgeTable tbody");
  tb.innerHTML = edges.map(e => `<tr style="${e.enabled ? "" : "opacity:.45"}">
    <td>${e.code}</td>
    <td>${nm[e.from_code]?.name || e.from_code} → ${nm[e.to_code]?.name || e.to_code}</td>
    <td><span class="tag" style="background:#7a6a56">${TYPE_CN[e.edge_type]}</span></td>
    <td>${e.distance_m}</td>
    <td><span class="tag crowd${e.crowd_level}">${["","畅通","一般","拥挤"][e.crowd_level]}</span></td>
    <td>${e.enabled ? "✅启用" : "⛔停用"}</td>
    <td><button class="btn-sm btn-edit" data-code="${e.code}">编辑</button>
        <button class="btn-sm btn-off" data-code="${e.code}">${e.enabled ? "停用" : "启用"}</button>
        <button class="btn-sm btn-del" data-code="${e.code}">删除</button></td></tr>`).join("");
  tb.querySelectorAll(".btn-edit").forEach(b => b.onclick = () => editEdge(b.dataset.code));
  tb.querySelectorAll(".btn-del").forEach(b => b.onclick = () => delEdge(b.dataset.code));
  tb.querySelectorAll(".btn-off").forEach(b => b.onclick = () => toggleEdge(b.dataset.code));
}

// ---------- 节点表单 ----------
function nodeFormData() {
  const f = document.getElementById("nodeForm");
  return {
    code: f.elements["code"].value, name: f.name.value, floor: +f.floor.value,
    node_type: f.node_type.value, x: +f.x.value, y: +f.y.value,
    crowd_level: +f.crowd_level.value,
  };
}
document.getElementById("nodeForm").addEventListener("submit", async e => {
  e.preventDefault();
  try { await api("/api/admin/node", "POST", nodeFormData());
    toast("节点已保存"); resetNodeForm(); await reload();
  } catch (err) { toast(err.message, true); }
});
function editNode(code) {
  const n = nodes.find(x => x.code === code);
  const f = document.getElementById("nodeForm");
  f.elements["code"].value = n.code; f.elements["code"].readOnly = true;
  f.name.value = n.name; f.floor.value = n.floor;
  f.node_type.value = n.node_type; f.x.value = n.x; f.y.value = n.y;
  f.crowd_level.value = n.crowd_level;
  document.getElementById("nodeFormTitle").textContent = "编辑节点：" + n.name;
  window.scrollTo(0, 0);
}
async function delNode(code) {
  if (!confirm("确认删除节点 " + code + " ？")) return;
  try { await api("/api/admin/node/delete", "POST", { code });
    toast("已删除"); await reload();
  } catch (err) { toast(err.message, true); }
}
function resetNodeForm() {
  const f = document.getElementById("nodeForm");
  f.reset(); f.elements["code"].readOnly = false;
  document.getElementById("nodeFormTitle").textContent = "新增节点";
}
document.getElementById("nodeReset").onclick = resetNodeForm;
document.getElementById("nodeFilter").oninput = renderNodes;

// ---------- 边表单 ----------
function edgeFormData() {
  const f = document.getElementById("edgeForm");
  return {
    code: f.elements["code"].value, from_code: f.from_code.value,
    to_code: f.to_code.value,
    edge_type: f.edge_type.value, name: f.name.value,
    distance_m: +f.distance_m.value, level_change: +f.level_change.value,
    crowd_level: +f.crowd_level.value, enabled: f.enabled.checked,
  };
}
document.getElementById("edgeForm").addEventListener("submit", async e => {
  e.preventDefault();
  try { await api("/api/admin/edge", "POST", edgeFormData());
    toast("通道已保存"); resetEdgeForm(); await reload();
  } catch (err) { toast(err.message, true); }
});
function editEdge(code) {
  const e = edges.find(x => x.code === code);
  const f = document.getElementById("edgeForm");
  f.elements["code"].value = e.code; f.elements["code"].readOnly = true;
  f.from_code.value = e.from_code; f.to_code.value = e.to_code;
  f.edge_type.value = e.edge_type; f.name.value = e.name;
  f.distance_m.value = e.distance_m; f.level_change.value = e.level_change;
  f.crowd_level.value = e.crowd_level; f.enabled.checked = !!e.enabled;
  document.getElementById("edgeFormTitle").textContent = "编辑通道：" + e.name;
  window.scrollTo(0, 0);
}
async function delEdge(code) {
  if (!confirm("确认删除通道 " + code + " ？")) return;
  try { await api("/api/admin/edge/delete", "POST", { code });
    toast("已删除"); await reload();
  } catch (err) { toast(err.message, true); }
}
async function toggleEdge(code) {
  const e = edges.find(x => x.code === code);
  try { await api("/api/admin/edge/toggle", "POST",
    { code, enabled: !e.enabled }); toast("状态已更新"); await reload();
  } catch (err) { toast(err.message, true); }
}
function resetEdgeForm() {
  const f = document.getElementById("edgeForm");
  f.reset(); f.elements["code"].readOnly = false; f.enabled.checked = true;
  document.getElementById("edgeFormTitle").textContent = "新增通道边";
}
document.getElementById("edgeReset").onclick = resetEdgeForm;

reload();
