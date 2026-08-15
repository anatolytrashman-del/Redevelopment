import type { ZonePoint } from '../data/buildingPlans';

// Точки контура ставятся вручную кликами по плану — почти горизонтальные и
// почти вертикальные рёбра обычно должны быть строго горизонтальными и
// вертикальными, но клик редко попадает пиксель в пиксель, отсюда "кривые"
// линии. Итеративно подтягиваем такие рёбра к оси: если ребро отклоняется от
// горизонтали/вертикали меньше чем на EDGE_SNAP_RATIO — выравниваем обе его
// точки по средней координате. По-настоящему диагональные рёбра (отклонение
// больше порога) не трогаем. Несколько проходов нужны, потому что соседние
// рёбра делят общую точку и тянут её каждое в свою сторону.
const EDGE_SNAP_RATIO = 0.35; // ~19° от оси
const ITERATIONS = 6;

export function straightenPoints(points: ZonePoint[]): ZonePoint[] {
  if (points.length < 3) return points;
  const result = points.map((p) => ({ ...p }));
  const n = result.length;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let i = 0; i < n; i++) {
      const a = result[i];
      const b = result[(i + 1) % n];
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      if (dx === 0 && dy === 0) continue;

      if (dy <= dx * EDGE_SNAP_RATIO) {
        const avgY = (a.y + b.y) / 2;
        a.y = avgY;
        b.y = avgY;
      } else if (dx <= dy * EDGE_SNAP_RATIO) {
        const avgX = (a.x + b.x) / 2;
        a.x = avgX;
        b.x = avgX;
      }
    }
  }

  return result.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));
}
