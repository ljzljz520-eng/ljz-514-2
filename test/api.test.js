// 端到端 API 测试：先启动服务（ADMIN_KEY=xxx npm start），默认 http://localhost:3000
const BASE = process.env.BASE || 'http://localhost:3000';
const KEY = process.env.ADMIN_KEY;
if (!KEY) {
  console.error('✗ 请设置 ADMIN_KEY 环境变量（与启动服务时一致），例如：ADMIN_KEY=xxx npm test');
  process.exit(1);
}
let failures = 0;
let checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log('✗', m); } };

async function j(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.admin) headers['X-Admin-Key'] = KEY;
  const res = await fetch(BASE + path, {
    method: opts.method || 'GET', headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

(async () => {
  const meta = (await j('/api/meta')).body;
  ok(meta.floors.length === 4, '返回 4 个楼层');
  const nodes = (await j('/api/nodes')).body;
  const edges = (await j('/api/edges')).body;
  ok(nodes.length > 0 && edges.every(e => e.id), `所有 ${edges.length} 条边都有 id`);
  ok(nodes.some(n => n.type === 'entrance'), '存在入口');
  const cashiers = nodes.filter(n => n.type === 'cashier');
  ok(cashiers.length >= 2, '至少 2 个收银台');

  let pairCount = 0;
  for (const z of nodes.filter(n => n.type === 'zone')) {
    for (const c of cashiers) {
      pairCount++;
      const { body: r } = await j('/api/route', { method: 'POST', body: { floorId: z.floor, zoneId: z.id, cashierId: c.id } });
      ok(!r.error && r.go.length >= 1 && r.back.length >= 1, `${z.name}→${c.name} 有路线`);
      for (const list of [r.go, r.back]) for (const opt of list) {
        ok(opt.edgeIds.every(Boolean) && opt.edgeIds.length === opt.nodeIds.length - 1, '边/节点对齐');
        ok(opt.steps[0].kind === 'start' && opt.steps.at(-1).kind === 'arrive', '起终点步骤');
        ok(opt.steps.some(s => /米|扶梯|电梯|楼梯/.test(s.text)), '含距离/交通指引');
        ok(opt.summary.minutes >= 1 && opt.summary.distance > 0, '汇总有效');
      }
    }
  }
  console.log(`覆盖 ${pairCount} 组 书区×收银台 查询`);

  ok((await j('/api/route', { method: 'POST', body: {} })).body.error, '缺参数报错');
  ok((await j('/api/route', { method: 'POST', body: { floorId: 2, zoneId: 'f2-lit', cashierId: 'f3-com' } })).body.error, '非收银台报错');
  ok((await j('/api/route', { method: 'POST', body: { floorId: 1, zoneId: 'f1-cash-a', cashierId: 'f1-cash-b' } })).body.error, '非书区目标报错');
  ok((await j('/api/route', { method: 'POST', body: { floorId: 1, zoneId: 'f1-info', cashierId: 'f1-cash-a' } })).body.error, '服务台作目标报错');
  ok((await j('/api/route', { method: 'POST', body: { floorId: 1, zoneId: 'f2-lit', cashierId: 'f1-cash-a', entranceId: 'f1-cash-a' } })).body.error, '非入口起点报错');
  ok((await j('/api/nodes', { method: 'POST', body: {} })).status === 401, '无密钥 401');
  ok((await j('/api/nodes', { method: 'POST', headers: { 'X-Admin-Key': 'wrong-key' }, body: {} })).status === 401, '错误密钥 401');

  const n = (await j('/api/nodes', { method: 'POST', admin: true,
    body: { floor: 3, type: 'zone', name: '测试区', x: 500, y: 470 } })).body;
  ok(n.id, '新增节点');
  ok((await j('/api/edges', { method: 'POST', admin: true,
    body: { type: 'elevator', a: 'f1-ele', b: 'f1-esc', crowd: 0 } })).body.error, '同层建电梯被拒');
  ok((await j('/api/edges', { method: 'POST', admin: true,
    body: { type: 'corridor', a: 'f1-entrance', b: 'f1-info', distance: -5 } })).body.error, '负数距离被拒');
  ok((await j('/api/edges', { method: 'POST', admin: true,
    body: { type: 'corridor', a: 'f1-entrance', b: 'f1-info', distance: 0 } })).body.error, '零距离被拒');
  ok((await j('/api/edges', { method: 'POST', admin: true,
    body: { type: 'corridor', a: 'f1-entrance', b: 'f1-info', distance: 'abc' } })).body.error, '非数字距离被拒');
  const e = (await j('/api/edges', { method: 'POST', admin: true,
    body: { type: 'corridor', a: n.id, b: 'f3-j-c', crowd: 2, wayName: '测试通道' } })).body;
  ok(e.id && e.distance > 0, '通道自动算距离');
  const put = await j('/api/edges/' + e.id, { method: 'PUT', admin: true,
    body: { id: e.id, type: 'corridor', a: n.id, b: 'f3-j-c', crowd: 3, wayName: '测试通道' } });
  ok(put.body.id === e.id && put.body.crowd === 3, 'PUT 保留 id、更新拥挤度（id 丢失回归）');
  ok((await j('/api/edges/' + e.id, { method: 'PUT', admin: true,
    body: { type: 'corridor', a: n.id, b: 'f3-j-c', crowd: 2, distance: -10 } })).body.error, 'PUT 负数距离被拒');
  const reachable = await j('/api/route', { method: 'POST', body: { floorId: 3, zoneId: n.id, cashierId: 'f1-cash-a' } });
  ok(!reachable.body.error, '新书区立即可达');
  const del = (await j('/api/nodes/' + n.id, { method: 'DELETE', admin: true })).body;
  ok(del.removedEdges === 1, '删节点连带删边');

  console.log(`共执行 ${checks} 项断言`);
  console.log(failures === 0 ? '🎉 全部测试通过' : `✗ ${failures} 项失败`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
