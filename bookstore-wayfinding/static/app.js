// ====== 全局状态 ======
let MAP = null;                 // {nodes, edges, floors}
let nodeMap = {}, edgeMap = {};
let planData = null;            // 后端 /api/plan 返回
let currentRoutes = [];
let activeRouteIdx = 0;
let activeStepIdx = -1;
let currentFloor = 1;
let prefFilter = "all";

const NODE_STYLE = {
  zone:       { fill: "#4f8fc0", shape: "rect", w: 120, h: 44 },
  cashier:    { fill: "#c8553d", shape: "rect", w: 110, h: 40 },
  entrance:   { fill: "#2f6b4f", shape: "rect", w: 100, h: 38 },
  escalator:  { fill: "#e0a82e", shape: "diamond", s: 17 },
  elevator:   { fill: "#8e7cc3", shape: "circle", r: 15 },
  hallway:    { fill: "#7fb069", shape: "circle", r: 14 },
  service:    { fill: "#588b8b", shape: "rect", w: 90, h: 34 },
  junction:   { fill: "#b3a58f", shape: "circle", r: 8 },
};
const EDGE_STYLE = {
  walkway:   { color: "#cfc4ae", w: 5 },
  escalator: { color: "#e0a82e", w: 4, dash: "8 5" },
  elevator:  { color: "#8e7cc3", w: 4, dash: "3 4" },
};
const PREF_ORDER = ["balanced", "comfort", "escalator"];

// ====== 初始化 ======
async function init() {
  MAP = await fetch("/api/map").then(r => r.json());
  nodeMap = Object.fromEntries(MAP.nodes.map(n => [n.code, n]));
  edgeMap = Object.fromEntries(MAP.edges.map(e => [e.code, e]));
  initFloorSwitch();
  initSelectors();
  drawMap();
  document.getElementById("planBtn").onclick = doPlan;
  document.getElementById("viaCashier").onchange = toggleCashier;
  document.querySelectorAll(".pref").forEach(b => b.onclick = () => {
    document.querySelectorAll(".pref").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    prefFilter = b.dataset.pref;
    if (planData) renderRoutes();
  });
}

function initFloorSwitch() {
  const wrap = document.getElementById("floorSwitch");
  wrap.innerHTML = "";
  MAP.floors.forEach(f => {
    const b = document.createElement("button");
    b.textContent = f + "F";
    if (f === currentFloor) b.classList.add("active");
    b.onclick = () => { currentFloor = f; drawMap(); };
    wrap.appendChild(b);
  });
}

function initSelectors() {
  const startSel = document.getElementById("startSel");
  const floorSel = document.getElementById("floorSel");
  floorSel.innerHTML = MAP.floors
    .map(f => `<option value="${f}">${f} 层</option>`).join("");
  const starts = MAP.nodes.filter(n =>
    ["entrance", "escalator", "elevator", "cashier", "service", "hallway"]
      .includes(n.node_type));
  startSel.innerHTML = starts.map(n =>
    `<option value="${n.code}" ${n.node_type === "entrance" ? "selected" : ""}>${n.name}</option>`).join("");

  const refreshZones = () => {
    const f = +floorSel.value;
    const zones = MAP.nodes.filter(n => n.floor === f && n.node_type === "zone");
    document.getElementById("zoneSel").innerHTML = zones.map(n =>
      `<option value="${n.code}">${n.name}</option>`).join("")
      || `<option value="">（该层暂无书区）</option>`;
    const cashiers = MAP.nodes.filter(n => n.floor === f && n.node_type === "cashier");
    document.getElementById("cashierSel").innerHTML =
      `<option value="">同层默认收银台</option>` +
      cashiers.map(n => `<option value="${n.code}">${n.name}</option>`).join("");
  };
  floorSel.onchange = refreshZones;
  refreshZones();
}

function toggleCashier() {
  document.getElementById("cashierWrap").style.display =
    this.checked ? "block" : "none";
}

// ====== 查询规划 ======
async function doPlan() {
  const errBox = document.getElementById("queryErr");
  errBox.textContent = "";
  const p = new URLSearchParams({
    start: document.getElementById("startSel").value,
    floor: document.getElementById("floorSel").value,
    zone: document.getElementById("zoneSel").value,
    via_cashier: document.getElementById("viaCashier").checked,
    cashier: document.getElementById("cashierSel").value || "",
  });
  const resp = await fetch("/api/plan?" + p.toString());
  const data = await resp.json();
  if (!resp.ok) { errBox.textContent = "⚠️ " + (data.error || "规划失败"); return; }
  planData = data;
  renderRoutes();
  document.getElementById("routeCard").style.display = "block";
}

function renderRoutes() {
  currentRoutes = prefFilter === "all"
    ? planData.routes
    : planData.routes.filter(r => r.profile === prefFilter);
  if (!currentRoutes.length)
    currentRoutes = planData.routes;
  activeRouteIdx = 0;
  activeStepIdx = -1;

  const wp = "路线：" + planData.start.name + " → " + planData.waypoints.join(" → ");
  document.getElementById("routeSummary").innerHTML =
    wp + `<br>${currentRoutes[0].summary}` +
    (currentRoutes[0].crowd_warnings.length
      ? `<div class="crowd-warn">⚠️ 拥挤路段：${currentRoutes[0].crowd_warnings.join("、")}</div>` : "");

  const tabs = document.getElementById("routeTabs");
  tabs.innerHTML = "";
  currentRoutes.forEach((r, i) => {
    const b = document.createElement("button");
    b.className = "tab" + (i === 0 ? " active" : "");
    b.innerHTML = `${r.label}<span class="t-sub">${Math.round(r.walk_m)}米 · `
      + `${Math.round(r.est_seconds / 60)}分钟 · 扶梯${r.escalator_times} 电梯${r.elevator_times}</span>`;
    b.onclick = () => { activeRouteIdx = i; activeStepIdx = -1; updateRouteView(); };
    tabs.appendChild(b);
  });
  updateRouteView();
}

function updateRouteView() {
  document.querySelectorAll(".tab").forEach((t, i) =>
    t.classList.toggle("active", i === activeRouteIdx));
  const r = currentRoutes[activeRouteIdx];
  document.getElementById("routeSummary").innerHTML =
    "路线：" + planData.start.name + " → " + planData.waypoints.join(" → ") +
    `<br>${r.summary}` +
    (r.crowd_warnings.length
      ? `<div class="crowd-warn">⚠️ 拥挤路段：${r.crowd_warnings.join("、")}</div>` : "");
  renderSteps(r);
  drawMap();
}

function renderSteps(route) {
  const ol = document.getElementById("stepList");
  ol.innerHTML = "";
  let n = 0;
  route.steps.forEach((s, idx) => {
    const li = document.createElement("li");
    li.className = "kind-" + s.kind;
    li.dataset.idx = idx;
    if (s.kind !== "arrival" && s.kind !== "start") {
      n += 1;
      li.innerHTML = `<span class="num">${n}</span>`;
    } else {
      li.innerHTML = `<span class="num">·</span>`;
    }
    li.innerHTML += `<span class="floor-badge">${s.floor}F</span>${s.instruction}`;
    if (s.kind === "walk" && s.distance_m)
      li.innerHTML += `<span class="meters">（${Math.round(s.distance_m)}米）</span>`;
    if (s.kind === "walk" || s.kind === "escalator" || s.kind === "elevator") {
      li.style.cursor = "pointer";
      li.onclick = () => {
        activeStepIdx = idx;
        currentFloor = s.floor;
        initFloorSwitch();
        drawMap();
        document.querySelectorAll(".steps li").forEach(x => x.classList.remove("hl"));
        li.classList.add("hl");
      };
    }
    ol.appendChild(li);
  });
}

// ====== SVG 地图 ======
function drawMap() {
  document.querySelectorAll("#floorSwitch button").forEach(b =>
    b.classList.toggle("active", b.textContent === currentFloor + "F"));
  const svg = document.getElementById("mapSvg");
  let html = `<rect x="20" y="20" width="960" height="660" rx="16" fill="#fdfbf6"
      stroke="#e5dccb" stroke-width="2"/>
    <text x="500" y="58" text-anchor="middle" font-size="26" font-weight="700"
      fill="#5a3d22">${currentFloor}F 书层平面图</text>`;

  const onFloor = e => {
    const a = nodeMap[e.from_code], b = nodeMap[e.to_code];
    return a.floor === currentFloor && b.floor === currentFloor;
  };

  // 边
  MAP.edges.filter(onFloor).forEach(e => {
    const a = nodeMap[e.from_code], b = nodeMap[e.to_code];
    const st = EDGE_STYLE[e.edge_type];
    const crowdColor = { 1: "", 2: "#e0a82e", 3: "#c0392b" }[e.crowd_level];
    html += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
      stroke="${st.color}" stroke-width="${st.w}"
      ${st.dash ? `stroke-dasharray="${st.dash}"` : ""} opacity="${e.enabled ? 1 : .25}"/>`;
    if (e.crowd_level >= 2) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      html += `<text x="${mx}" y="${my - 7}" text-anchor="middle" font-size="11"
        fill="${crowdColor}">${"●".repeat(e.crowd_level - 1)}</text>`;
    }
  });

  // 当前路线覆盖层
  const route = currentRoutes[activeRouteIdx];
  if (route) {
    route.edge_codes.forEach(code => {
      const e = edgeMap[code];
      if (!e || !onFloor(e)) return;
      const a = nodeMap[e.from_code], b = nodeMap[e.to_code];
      html += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
        stroke="#e23e57" stroke-width="7" stroke-linecap="round" opacity="0.85"/>`;
    });
    // 步骤高亮：当前边闪烁
    const step = route.steps[activeStepIdx];
    if (step && step.edge_codes) {
      step.edge_codes.forEach(code => {
        const e = edgeMap[code];
        if (!e || !onFloor(e)) return;
        const a = nodeMap[e.from_code], b = nodeMap[e.to_code];
        html += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
          stroke="#ffd400" stroke-width="9" stroke-linecap="round" opacity="0.9">
          <animate attributeName="opacity" values="0.9;0.2;0.9" dur="1.1s"
          repeatCount="indefinite"/></line>`;
      });
    }
    // 起终点标记
    route.node_codes.forEach(code => {
      const n = nodeMap[code];
      if (!n || n.floor !== currentFloor) return;
      const isStart = code === route.node_codes[0];
      const isEnd = code === route.node_codes[route.node_codes.length - 1];
      if (isStart) html += pin(n, "起", "#2f6b4f");
      if (isEnd) html += pin(n, "终", "#c8553d");
    });
  }

  // 节点
  MAP.nodes.filter(n => n.floor === currentFloor).forEach(n => {
    html += nodeShape(n);
  });

  svg.innerHTML = html;
}

function pin(n, text, color) {
  return `<g><circle cx="${n.x}" cy="${n.y - 30}" r="13" fill="${color}"
    stroke="#fff" stroke-width="2"/>
    <text x="${n.x}" y="${n.y - 25}" text-anchor="middle" font-size="13"
    fill="#fff" font-weight="700">${text}</text>
    <line x1="${n.x}" y1="${n.y - 17}" x2="${n.x}" y2="${n.y - 4}"
    stroke="${color}" stroke-width="2"/></g>`;
}

function nodeShape(n) {
  const st = NODE_STYLE[n.node_type];
  const crowdRing = n.crowd_level >= 3
    ? `stroke="#c0392b" stroke-width="3"` : `stroke="#fff" stroke-width="1.5"`;
  let shape = "";
  if (st.shape === "rect") {
    shape = `<rect x="${n.x - st.w / 2}" y="${n.y - st.h / 2}" width="${st.w}"
      height="${st.h}" rx="8" fill="${st.fill}" ${crowdRing}/>`;
  } else if (st.shape === "circle") {
    shape = `<circle cx="${n.x}" cy="${n.y}" r="${st.r}" fill="${st.fill}" ${crowdRing}/>`;
  } else if (st.shape === "diamond") {
    const s = st.s;
    shape = `<polygon points="${n.x},${n.y - s} ${n.x + s},${n.y} ${n.x},${n.y + s}
      ${n.x - s},${n.y}" fill="${st.fill}" ${crowdRing}/>`;
  }
  const labelColor = ["zone", "cashier", "entrance", "service"].includes(n.node_type)
    ? "#fff" : "#4a3f30";
  const fs = n.node_type === "junction" ? 0 : 12.5;
  const label = fs
    ? `<text x="${n.x}" y="${n.y + st.h / 2 + 16}" text-anchor="middle"
        font-size="${fs}" fill="#3d342a" font-weight="600">${n.name.replace(/^./, m => m).replace(/^[123]F\s*/, "")}</text>`
    : "";
  const inner = ["escalator", "elevator", "hallway"].includes(n.node_type)
    ? `<text x="${n.x}" y="${n.y + 4}" text-anchor="middle" font-size="11"
        fill="#fff" font-weight="700">${n.node_type === "escalator" ? "扶梯"
        : n.node_type === "elevator" ? "电梯" : "中庭"}</text>`
    : (st.shape === "rect"
        ? `<text x="${n.x}" y="${n.y + 4.5}" text-anchor="middle" font-size="13"
            fill="${labelColor}" font-weight="600">${n.name.replace(/^[123]F\s*/, "")}</text>`
        : "");
  return `<g>${shape}${inner}${label}</g>`;
}

init();
