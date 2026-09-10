// 将节点序列翻译为自然语言分步指引
const store = require('./store');
const { edgeSeconds } = require('./graph');

const CROWD_WORD = ['畅通', '人较少', '比较拥挤', '非常拥挤'];

function bearing(ax, ay, bx, by) {
  // SVG y 轴向下；0=正北，顺时针
  return (Math.atan2(bx - ax, ay - by) * 180 / Math.PI + 360) % 360;
}
function turnWord(deg) {
  const d = ((deg + 540) % 360) - 180;
  if (Math.abs(d) <= 25) return '直行';
  if (d > 25 && d <= 70) return '右前方转弯';
  if (d > 70 && d <= 135) return '右转';
  if (d > 135) return '掉头折返';
  if (d < -25 && d >= -70) return '左前方转弯';
  if (d < -70 && d >= -135) return '左转';
  return '掉头折返';
}
function clockWord(sec) {
  if (sec < 40) return '不到 1 分钟';
  return '约 ' + Math.max(1, Math.round(sec / 60)) + ' 分钟';
}
const floorCn = (f) => f + ' 楼';

// path: { nodes:[ids], edges:[edgeIds] }
function describe(path) {
  const nmap = new Map(store.getNodes().map(n => [n.id, n]));
  const emap = new Map(store.getEdges().map(e => [e.id, e]));
  const seq = path.nodes.map(id => nmap.get(id));
  const eids = path.edges;

  const steps = [];
  const start = seq[0];
  const goal = seq[seq.length - 1];

  steps.push({
    kind: 'start', floor: start.floor,
    text: `从「${start.name}」出发，准备前往${floorCn(goal.floor)}「${goal.name}」。`,
    nodeId: start.id
  });

  let totalSeconds = 0, totalDistance = 0, crowdedCount = 0, crowdMax = 0;
  const floorsTouched = new Set([start.floor]);

  for (let i = 0; i < eids.length; i++) {
    const edge = emap.get(eids[i]);
    const u = seq[i], v = seq[i + 1];
    const secs = edgeSeconds(edge, u, v);
    totalSeconds += secs;
    totalDistance += edge.distance || 6;
    crowdedCount += (edge.crowd || 0) >= 2 ? 1 : 0;
    crowdMax = Math.max(crowdMax, edge.crowd || 0);
    floorsTouched.add(v.floor);

    if (edge.type !== 'corridor') {
      const upDown = v.floor > u.floor ? '上' : '下';
      const fl = Math.abs(v.floor - u.floor) > 1
        ? `${u.floor} 楼直达 ${v.floor} 楼` : `到 ${v.floor} 楼`;
      let text;
      if (edge.type === 'escalator') {
        text = `在「${u.name}」乘${upDown}行扶梯，前往 ${v.floor} 楼（约 30 秒）。`;
      } else if (edge.type === 'elevator') {
        text = `在「${u.name}」乘电梯${upDown}行，${fl}，请按 ${v.floor} 楼按键（${clockWord(secs)}）。`;
      } else {
        text = `走${upDown}行步行楼梯，从 ${u.floor} 楼${fl}（${clockWord(secs)}）。`;
      }
      if (edge.crowd >= 2) text += ` 注意：此处${CROWD_WORD[edge.crowd]}。`;
      steps.push({
        kind: 'vertical', moveType: edge.type, floor: v.floor,
        fromFloor: u.floor, toFloor: v.floor,
        text, seconds: secs, fromId: u.id, toId: v.id, edgeId: edge.id,
        crowd: edge.crowd
      });
      continue;
    }

    const prevBearing = i > 0 && emap.get(eids[i - 1]).type === 'corridor'
      ? bearing(seq[i - 1].x, seq[i - 1].y, u.x, u.y) : null;
    const curBearing = bearing(u.x, u.y, v.x, v.y);
    const turn = prevBearing === null ? null : turnWord(curBearing - prevBearing);
    const wayLabel = edge.wayName || '通道';

    let text;
    if (turn === null) {
      text = `沿${wayLabel}向「${v.name}」方向走约 ${edge.distance} 米。`;
    } else if (turn === '直行') {
      text = `继续沿${wayLabel}直行约 ${edge.distance} 米。`;
    } else {
      text = `在「${u.name}」${turn}，进入${wayLabel}，再走约 ${edge.distance} 米。`;
    }
    if (i + 1 < seq.length - 1 && (v.type === 'zone' || v.type === 'cashier' || v.type === 'info')) {
      text += ` 途经「${v.name}」。`;
    }
    if (edge.crowd >= 2) text += `（当前${CROWD_WORD[edge.crowd]}，注意避让）`;

    steps.push({
      kind: 'walk', turn, floor: v.floor,
      text, distance: edge.distance, seconds: secs,
      fromId: u.id, toId: v.id, edgeId: edge.id, crowd: edge.crowd
    });
  }

  steps.push({
    kind: 'arrive', floor: goal.floor,
    text: `到达${floorCn(goal.floor)}「${goal.name}」。`,
    nodeId: goal.id
  });

  const summary = {
    minutes: Math.max(1, Math.round(totalSeconds / 60)),
    seconds: Math.round(totalSeconds),
    distance: totalDistance,
    crowdedCount,
    crowdLevel: crowdMax,
    floors: [...floorsTouched].sort((a,b)=>a-b),
    edgeCount: eids.length
  };
  return { steps, summary };
}

function optionTags(option, all) {
  const tags = [];
  const bestTime = Math.min(...all.map(o => o.seconds));
  const bestCrowd = Math.min(...all.map(o => o.crowdSum));
  const vertTypes = new Set(option.steps.filter(s => s.kind === 'vertical').map(s => s.moveType));
  if (Math.abs(option.seconds - bestTime) < 1) tags.push('用时最短');
  if (option.crowdSum === bestCrowd && all.some(o => o.crowdSum > bestCrowd)) tags.push('最通畅');
  if (vertTypes.has('elevator') && !vertTypes.has('stairs')) tags.push('电梯直达');
  if (vertTypes.has('escalator') && !vertTypes.has('stairs')) tags.push('乘坐扶梯');
  if (vertTypes.has('stairs')) tags.push('走楼梯更省时');
  if (!tags.length) tags.push('备选路线');
  return [...new Set(tags)];
}

module.exports = { describe, optionTags, CROWD_WORD };
