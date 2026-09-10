// 画布坐标（0~1000, 0~700）与实际米数换算：一层约 100m × 70m
const METERS_PER_UNIT = 0.1;
function corridorMeters(a, b) {
  return Math.max(1, Math.round(Math.hypot(a.x - b.x, a.y - b.y) * METERS_PER_UNIT));
}
module.exports = { corridorMeters, METERS_PER_UNIT };
