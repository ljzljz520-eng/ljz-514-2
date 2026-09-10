/* ===================== 全局状态 ===================== */
const $ = (id) => document.getElementById(id);
let meta = null, nodes = [], edges = [];
let result = null;
const sel = { go: 0, back: 0, mapFloor: 1 };
let adminKey = localStorage.getItem('adminKey') || '';

const CROWD_NAME = ['畅通', '人较少', '拥挤', '很挤'];
const CROWD_COLOR = ['#16a34a', '#84cc16', '#f59e0b', '#dc2626'];
const TYPE_COLOR = {
  entrance: '#16a34a', info: '#0891b2', cashier: '#d97706', zone: '#1d4ed8',
  junction: '#94a3b8', escalator: '#7c3aed', elevator: '#6d28d9', stairs: '#a855f7',
};
const nodeById = (id) => nodes.find(n => n.id === id);
const edgeById = (id) => edges.find(e => e.id === id);

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (opts.admin) headers['X-Admin-Key'] = adminKey;
  const res = await fetch(path, {
    method: opts.method || 'GET', headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('请求失败 ' + res.status));
  return data;
}

/* ===================== 初始化 ===================== */
async function loadAll() {
  meta = await api('/api/meta');
  nodes = await api('/api/nodes');
  edges = await api('/api/edges');
}
function initUserSelects() {
  $('in-entrance').innerHTML = nodes.filter(n => n.type === 'entrance')
    .map(n => `<option value="${n.id}">${n.name}</option>`).join('');
  $('in-floor').innerHTML = '<option value="">请选择楼层</option>' +
    meta.floors.map(f => `<option value="${f.id}">${f.name}（${f.theme}）</option>`).join('');
  $('in-cashier').innerHTML = nodes.filter(n => n.type === 'cashier')
    .map(n => `<option value="${n.id}">${n.name}</option>`).join('');
  onFloorChange();
}
function onFloorChange() {
  const f = Number($('in-floor').value);
  const zsel = $('in-zone');
  const list = nodes.filter(n => n.type === 'zone' && (!f || n.floor === f));
  zsel.innerHTML = '<option value="">请选择书区</option>' +
    list.map(n => `<option value="${n.id}">${n.name}</option>`).join('');
  zsel.disabled = !f;
}

/* ===================== 路线查询 ===================== */
async function searchRoute() {
  $('user-error').classList.add('hidden');
  const floorId = Number($('in-floor').value);
  const zoneId = $('in-zone').value;
  const cashierId = $('in-cashier').value;
  if (!floorId || !zoneId || !cashierId) return showUserError('请先完整选择 楼层、书区、收银台。');
  $('btn-search').disabled = true;
  try {
    result = await api('/api/route', {
      method: 'POST',
      body: { floorId, zoneId, cashierId, entranceId: $('in-entrance').value }
    });
    sel.go = 0; sel.back = 0; sel.mapFloor = floorId;
    renderResult();
  } catch (e) { showUserError(e.message); }
  finally { $('btn-search').disabled = false; }
}
function showUserError(msg) {
  const el = $('user-error');
  el.textContent = '⚠️ ' + msg;
  el.classList.remove('hidden');
}
function optionCard(opt, idx, which) {
  const s = opt.summary;
  return `<div class="opt ${sel[which] === idx ? 'sel' : ''}" data-which="${which}" data-idx="${idx}">
    <div class="rank">${idx === 0 ? '⭐ 推荐方案' : '备选方案 ' + idx}</div>
    <div class="big">${s.minutes} 分钟</div>
    <div class="meta">约 ${s.distance} 米 · 经过 ${s.floors.map(f => f + '楼').join('、')}
      · 拥挤路段 ${s.crowdedCount} 段</div>
    <div class="tags">${opt.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
  </div>`;
}
function renderResult() {
  $('result-area').classList.remove('hidden');
  $('go-opts').innerHTML = result.go.map((o, i) => optionCard(o, i, 'go')).join('');
  $('back-opts').innerHTML = result.back.map((o, i) => optionCard(o, i, 'back')).join('');
  document.querySelectorAll('#go-opts .opt, #back-opts .opt').forEach(el => {
    el.addEventListener('click', () => { sel[el.dataset.which] = Number(el.dataset.idx); renderResult(); });
  });
  $('go-steps-title').textContent = `🅰 去程：${result.query.entrance.name} → ${result.query.zone.name}`;
  $('back-steps-title').textContent = `🅱 离场：${result.query.zone.name} → ${result.query.cashier.name}`;
  renderTimeline($('go-steps'), result.go[sel.go]);
  renderTimeline($('back-steps'), result.back[sel.back]);
  renderFloorSwitch();
  renderMainMap();
}
function renderTimeline(ul, opt) {
  ul.innerHTML = opt.steps.map((st, i) => {
    let dot = i;
    if (st.kind === 'start') dot = '起';
    if (st.kind === 'arrive') dot = '终';
    let extra = '';
    if (st.kind === 'walk') {
      const seg = ['约 ' + st.distance + ' 米', st.seconds < 40 ? '不到 1 分钟' : '约 ' + Math.max(1, Math.round(st.seconds / 60)) + ' 分钟'];
      if (st.crowd >= 2) seg.push(`<span class="crowd c${st.crowd}">${CROWD_NAME[st.crowd]}</span>`);
      extra = `<div class="step-meta">${seg.join(' · ')}</div>`;
    } else if (st.kind === 'vertical') {
      extra = `<div class="step-meta"><span class="crowd c${st.crowd}">${CROWD_NAME[st.crowd]}</span> · ${st.fromFloor}楼 → ${st.toFloor}楼</div>`;
    }
    return `<li class="${st.kind}">
      <span class="dot">${dot}</span>
      <div><span class="floorbadge">${st.floor}F</span><span class="step-text">${st.text}</span></div>
      ${extra}
    </li>`;
  }).join('');
}
function renderFloorSwitch() {
  const touched = new Set();
  for (const o of [result.go[sel.go], result.back[sel.back]]) o.summary.floors.forEach(f => touched.add(f));
  $('map-floors').innerHTML = meta.floors.map(f =>
    `<button data-f="${f.id}" class="${sel.mapFloor === f.id ? 'active' : ''}">${f.name}${touched.has(f.id) ? ' ●' : ''}</button>`).join('');
  document.querySelectorAll('#map-floors button').forEach(b => b.addEventListener('click', () => {
    sel.mapFloor = Number(b.dataset.f); renderFloorSwitch(); renderMainMap();
  }));
}

/* ===================== SVG 平面图 ===================== */
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function renderMap(svgEl, floor, opts = {}) {
  const hGo = new Set(opts.goEdgeIds || []);
  const hBack = new Set(opts.backEdgeIds || []);
  const floorEdges = edges.filter(e => {
    const a = nodeById(e.a), b = nodeById(e.b);
    return a && b && a.floor === floor && b.floor === floor;
  });
  const floorNodes = nodes.filter(n => n.floor === floor);
  let out = '';

  for (const e of floorEdges) {
    const a = nodeById(e.a), b = nodeById(e.b);
    if (hGo.has(e.id) || hBack.has(e.id)) continue;
    out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
      stroke="${CROWD_COLOR[e.crowd]}" stroke-width="7" stroke-linecap="round" opacity="0.28"/>`;
  }
  for (const e of floorEdges) {
    const a = nodeById(e.a), b = nodeById(e.b);
    if (hGo.has(e.id)) {
      out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
        stroke="#1d4ed8" stroke-width="11" stroke-linecap="round" opacity="0.92"/>`;
    }
    if (hBack.has(e.id)) {
      out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
        stroke="#ea580c" stroke-width="7" stroke-linecap="round" opacity="0.92"/>`;
    }
  }
  for (const e of floorEdges) {
    if (!e.wayName || e.wayName.includes('区') || e.wayName.includes('厅') || e.wayName.includes('入口')) continue;
    const a = nodeById(e.a), b = nodeById(e.b);
    out += `<text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 8}" text-anchor="middle"
      font-size="11" fill="#94a3b8">${esc(e.wayName)}</text>`;
  }
  for (const n of floorNodes) {
    const c = TYPE_COLOR[n.type] || '#64748b';
    if (n.type === 'junction') {
      out += `<circle cx="${n.x}" cy="${n.y}" r="6" fill="#fff" stroke="${c}" stroke-width="2.5"/>`;
    } else if (n.type === 'escalator' || n.type === 'elevator' || n.type === 'stairs') {
      const icon = n.type === 'escalator' ? '⬆' : n.type === 'elevator' ? '🛗' : '🪜';
      out += `<rect x="${n.x - 15}" y="${n.y - 15}" width="30" height="30" rx="7" fill="${c}"/>
        <text x="${n.x}" y="${n.y + 6}" text-anchor="middle" font-size="15">${icon}</text>`;
    } else {
      const w = n.type === 'zone' ? 104 : 120, h = 34;
      out += `<rect x="${n.x - w / 2}" y="${n.y - h / 2}" width="${w}" height="${h}" rx="9"
        fill="#fff" stroke="${c}" stroke-width="2.5"/>
        <circle cx="${n.x - w / 2 + 12}" cy="${n.y}" r="5" fill="${c}"/>
        <text x="${n.x + 8}" y="${n.y + 5}" text-anchor="middle" font-size="13.5" font-weight="600" fill="#1e293b">${esc(n.name.replace(/（.*?）/, ''))}</text>`;
    }
  }
  for (const mark of (opts.marks || [])) {
    const n = nodeById(mark.id);
    if (n && n.floor === floor) {
      out += `<text x="${n.x}" y="${n.y - 26}" text-anchor="middle" font-size="20">${mark.icon}</text>`;
    }
  }
  if (opts.clickable) out += `<rect x="0" y="0" width="1000" height="700" fill="transparent"/>`;
  svgEl.innerHTML = out;
}
function onAdminMapClick(ev) {
  const svg = $('admin-map');
  const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  $('nf-x').value = Math.round(p.x);
  $('nf-y').value = Math.round(p.y);
  $('nf-floor').value = $('nf-map-floor').value;
}
function renderMainMap() {
  if (!result) return;
  renderMap($('map'), sel.mapFloor, {
    goEdgeIds: result.go[sel.go].edgeIds,
    backEdgeIds: result.back[sel.back].edgeIds,
    marks: [
      { id: result.query.entrance.id, icon: '🚩' },
      { id: result.query.zone.id, icon: '📖' },
      { id: result.query.cashier.id, icon: '💰' },
    ],
  });
}

/* ===================== 管理员 ===================== */
async function adminLogin() {
  adminKey = $('admin-key').value.trim();
  try {
    await api('/api/nodes', { method: 'POST', admin: true, body: {} });
    loginOk();
  } catch (e) {
    if (/密钥/.test(e.message)) {
      const el = $('admin-login-error');
      el.textContent = '⚠️ ' + e.message; el.classList.remove('hidden');
    } else loginOk(); // 400 校验错误 = 密钥已通过
  }
}
function loginOk() {
  localStorage.setItem('adminKey', adminKey);
  $('admin-login-card').classList.add('hidden');
  $('admin-panel').classList.remove('hidden');
  initAdminForms();
  refreshAdminData();
}
function adminLogout() {
  adminKey = ''; localStorage.removeItem('adminKey');
  $('admin-panel').classList.add('hidden');
  $('admin-login-card').classList.remove('hidden');
  $('admin-key').value = '';
}
async function refreshAdminData() {
  nodes = await api('/api/nodes');
  edges = await api('/api/edges');
  renderNodeTable();
  renderEdgeTable();
  fillEndpointSelects();
  renderAdminMap_();
  initUserSelects();
}
function initAdminForms() {
  $('nf-type').innerHTML = Object.entries(meta.nodeTypes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('nf-floor').innerHTML = meta.floors.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  $('nf-map-floor').innerHTML = meta.floors.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  $('ef-type').innerHTML = Object.entries(meta.edgeTypes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('ef-crowd').innerHTML = CROWD_NAME.map((n, i) => `<option value="${i}">${n}</option>`).join('');
}
function fillEndpointSelects() {
  const groups = meta.floors.map(f =>
    `<optgroup label="${f.name}">${nodes.filter(n => n.floor === f.id)
      .map(n => `<option value="${n.id}">${n.name} [${meta.nodeTypes[n.type]}]</option>`).join('')}</optgroup>`).join('');
  $('ef-a').innerHTML = groups;
  $('ef-b').innerHTML = groups;
}
function formMsg(elId, ok, msg) {
  const el = $(elId);
  el.innerHTML = `<span class="${ok ? 'okline' : 'error'}" style="padding:6px 12px;display:inline-block">${msg}</span>`;
  if (ok) setTimeout(() => { el.innerHTML = ''; }, 2500);
}

function renderNodeTable() {
  $('node-count').textContent = `共 ${nodes.length} 个`;
  $('node-tbody').innerHTML = nodes.map(n => `<tr>
    <td>${n.id}</td><td>${esc(n.name)}</td><td>${meta.nodeTypes[n.type]}</td>
    <td>${n.floor} 楼</td><td>${n.x}</td><td>${n.y}</td>
    <td>
      <button class="btn ghost sm" data-act="edit-node" data-id="${n.id}">编辑</button>
      <button class="btn danger sm" data-act="del-node" data-id="${n.id}">删除</button>
    </td></tr>`).join('');
}
async function saveNode() {
  const id = $('nf-id').value;
  const body = {
    name: $('nf-name').value.trim(), type: $('nf-type').value,
    floor: Number($('nf-floor').value), x: Number($('nf-x').value), y: Number($('nf-y').value),
  };
  try {
    if (id) await api('/api/nodes/' + id, { method: 'PUT', admin: true, body });
    else await api('/api/nodes', { method: 'POST', admin: true, body });
    resetNodeForm();
    await refreshAdminData();
    formMsg('node-form-msg', true, id ? '节点已更新' : '节点已新增');
  } catch (e) { formMsg('node-form-msg', false, '⚠️ ' + e.message); }
}
function editNode(id) {
  const n = nodeById(id);
  $('nf-id').value = n.id; $('nf-name').value = n.name; $('nf-type').value = n.type;
  $('nf-floor').value = n.floor; $('nf-x').value = n.x; $('nf-y').value = n.y;
  $('node-form-title').textContent = '编辑节点 ' + n.id;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function deleteNode(id) {
  const n = nodeById(id);
  if (!confirm(`确认删除节点「${n.name}」？挂接的通道边会一并删除。`)) return;
  try {
    const r = await api('/api/nodes/' + id, { method: 'DELETE', admin: true });
    await refreshAdminData();
    alert(`已删除，连带删除 ${r.removedEdges} 条边。`);
  } catch (e) { alert(e.message); }
}
function resetNodeForm() {
  ['nf-id', 'nf-name', 'nf-x', 'nf-y'].forEach(i => $(i).value = '');
  $('node-form-title').textContent = '新增节点';
}

function renderEdgeTable() {
  $('edge-count').textContent = `共 ${edges.length} 条`;
  $('edge-tbody').innerHTML = edges.map(e => {
    const a = nodeById(e.a), b = nodeById(e.b);
    return `<tr>
      <td>${e.id}</td><td>${meta.edgeTypes[e.type]}</td>
      <td>${a ? esc(a.name) : e.a}（${a ? a.floor + 'F' : '-'}）</td>
      <td>${b ? esc(b.name) : e.b}（${b ? b.floor + 'F' : '-'}）</td>
      <td>${esc(e.wayName || '—')}</td><td>${e.distance || '—'}</td>
      <td><span class="pill t${e.crowd}">${CROWD_NAME[e.crowd]}</span></td>
      <td>
        <button class="btn ghost sm" data-act="edit-edge" data-id="${e.id}">编辑</button>
        <button class="btn danger sm" data-act="del-edge" data-id="${e.id}">删除</button>
      </td></tr>`;
  }).join('');
}
async function saveEdge() {
  const id = $('ef-id').value;
  const body = {
    type: $('ef-type').value, a: $('ef-a').value, b: $('ef-b').value,
    crowd: Number($('ef-crowd').value), wayName: $('ef-wayname').value.trim(),
    distance: $('ef-distance').value ? Number($('ef-distance').value) : null,
  };
  try {
    if (id) await api('/api/edges/' + id, { method: 'PUT', admin: true, body });
    else await api('/api/edges', { method: 'POST', admin: true, body });
    resetEdgeForm();
    await refreshAdminData();
    formMsg('edge-form-msg', true, id ? '边已更新' : '边已新增，路线推荐将立即生效');
  } catch (e) { formMsg('edge-form-msg', false, '⚠️ ' + e.message); }
}
function editEdge(id) {
  const e = edgeById(id);
  $('ef-id').value = e.id; $('ef-type').value = e.type;
  $('ef-a').value = e.a; $('ef-b').value = e.b; $('ef-crowd').value = e.crowd;
  $('ef-wayname').value = e.wayName || ''; $('ef-distance').value = e.distance || '';
  $('edge-form-title').textContent = '编辑边 ' + e.id;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function deleteEdge(id) {
  if (!confirm('确认删除这条通道边？可能导致某些区域不可达。')) return;
  try { await api('/api/edges/' + id, { method: 'DELETE', admin: true }); await refreshAdminData(); }
  catch (e) { alert(e.message); }
}
function resetEdgeForm() {
  ['ef-id', 'ef-wayname', 'ef-distance'].forEach(i => $(i).value = '');
  $('ef-crowd').value = '0';
  $('edge-form-title').textContent = '新增通道/跨层边';
}
function renderAdminMap_() {
  if ($('admin-panel').classList.contains('hidden')) return;
  renderMap($('admin-map'), Number($('nf-map-floor').value), { clickable: true });
}

/* ===================== 事件 ===================== */
function bind() {
  $('tab-user').addEventListener('click', () => switchTab('user'));
  $('tab-admin').addEventListener('click', () => switchTab('admin'));
  $('in-floor').addEventListener('change', onFloorChange);
  $('btn-search').addEventListener('click', searchRoute);

  $('btn-login').addEventListener('click', adminLogin);
  $('admin-key').addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
  $('btn-logout').addEventListener('click', adminLogout);
  $('st-node').addEventListener('click', () => switchSubTab('node'));
  $('st-edge').addEventListener('click', () => switchSubTab('edge'));
  $('btn-node-save').addEventListener('click', saveNode);
  $('btn-node-cancel').addEventListener('click', resetNodeForm);
  $('btn-edge-save').addEventListener('click', saveEdge);
  $('btn-edge-cancel').addEventListener('click', resetEdgeForm);
  $('nf-map-floor').addEventListener('change', renderAdminMap_);
  $('admin-map').addEventListener('click', (ev) => {
    if ($('admin-panel').classList.contains('hidden')) return;
    onAdminMapClick(ev);
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    if (act === 'edit-node') editNode(id);
    if (act === 'del-node') deleteNode(id);
    if (act === 'edit-edge') editEdge(id);
    if (act === 'del-edge') deleteEdge(id);
  });
}
function switchTab(t) {
  $('view-user').classList.toggle('hidden', t !== 'user');
  $('view-admin').classList.toggle('hidden', t !== 'admin');
  $('tab-user').classList.toggle('active', t === 'user');
  $('tab-admin').classList.toggle('active', t === 'admin');
  if (t === 'admin' && adminKey) autoLogin();
}
function switchSubTab(t) {
  $('tab-node-panel').classList.toggle('hidden', t !== 'node');
  $('tab-edge-panel').classList.toggle('hidden', t !== 'edge');
  $('st-node').classList.toggle('active', t === 'node');
  $('st-edge').classList.toggle('active', t === 'edge');
}
async function autoLogin() {
  try {
    await api('/api/nodes', { method: 'POST', admin: true, body: {} });
    loginOk();
  } catch (e) {
    if (/密钥/.test(e.message)) adminLogout(); else loginOk();
  }
}

(async function main() {
  bind();
  await loadAll();
  initUserSelects();
  if (adminKey) autoLogin();
})();
