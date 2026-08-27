export function sweepEase(x: number): number {
  var p = [0.33, 1, 0.68, 1];
  var cx = 3 * p[0];
  var bx = 3 * (p[2] - p[0]) - cx;
  var ax = 1 - cx - bx;
  var cy = 3 * p[1];
  var by = 3 * (p[3] - p[1]) - cy;
  var ay = 1 - cy - by;
  var t = x;
  for (var i = 0; i < 8; i++) {
    var e = ((ax * t + bx) * t + cx) * t - x;
    if (Math.abs(e) < 0.0001) { break; }
    t -= e / (((3 * ax * t + 2 * bx) * t + cx) || 0.000001);
  }
  return ((ay * t + by) * t + cy) * t;
}
