// 大世界地图（简略层）：平滑海岸线大洲 + 地形色斑 + 山脉/河流/湖泊 + 区域标记
// 复用场景：开局发源地选择（可点选）与游戏内"世界"视图（当前文明标记 + 区域信息点选）
import { WORLD, type RegionDef } from '../core/world'

export interface MapColors {
  sea: string; seaHi: string; halo: string; land: string; landEdge: string
  desert: string; forest: string; steppe: string; tundra: string
  mountain: string; mountainSnow: string; water: string
  regionOk: string; regionLocked: string; selected: string; current: string
}

const DEFAULT: MapColors = {
  sea: '#3a5262', seaHi: '#466376', halo: 'rgba(122, 176, 200, 0.30)',
  land: '#71805c', landEdge: '#4d5a42',
  desert: '#c4ad74', forest: '#5a7450', steppe: '#99a763', tundra: '#8d948b',
  mountain: '#7e7e72', mountainSnow: '#e8e6dd', water: '#6d94ab',
  regionOk: '#d9a24a', regionLocked: '#8a8a7c', selected: '#e86a4a', current: '#e86a4a',
}

type Pt = [number, number]

function smoothClosedPath(ctx: CanvasRenderingContext2D, poly: Pt[], X: (v: number) => number, Y: (v: number) => number): void {
  // 中点二次贝塞尔闭合曲线：海岸线圆滑
  const n = poly.length
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  ctx.beginPath()
  const start = mid(poly[n - 1], poly[0])
  ctx.moveTo(X(start[0]), Y(start[1]))
  for (let i = 0; i < n; i++) {
    const m = mid(poly[i], poly[(i + 1) % n])
    ctx.quadraticCurveTo(X(poly[i][0]), Y(poly[i][1]), X(m[0]), Y(m[1]))
  }
  ctx.closePath()
}

function smoothOpenPath(ctx: CanvasRenderingContext2D, line: Pt[], X: (v: number) => number, Y: (v: number) => number): void {
  ctx.beginPath()
  ctx.moveTo(X(line[0][0]), Y(line[0][1]))
  for (let i = 1; i < line.length - 1; i++) {
    const xc = (X(line[i][0]) + X(line[i + 1][0])) / 2
    const yc = (Y(line[i][1]) + Y(line[i + 1][1])) / 2
    ctx.quadraticCurveTo(X(line[i][0]), Y(line[i][1]), xc, yc)
  }
  const last = line[line.length - 1]
  ctx.lineTo(X(last[0]), Y(last[1]))
}

function pip(pt: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, opts: { selectable?: RegionDef[]; selectedId?: string | null; currentId?: string | null; colors?: Partial<MapColors> }): void {
  const c = { ...DEFAULT, ...opts.colors }
  const X = (x: number) => (x / 100) * w
  const Y = (y: number) => (y / 100) * h
  const scale = w / 640
  ctx.clearRect(0, 0, w, h)

  // 海洋：上下渐变 + 淡波纹
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, c.sea)
  grad.addColorStop(0.5, c.seaHi)
  grad.addColorStop(1, c.sea)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
  ctx.lineWidth = 1
  for (let i = 0; i < 6; i++) {
    const yy = h * (0.12 + i * 0.15)
    ctx.beginPath()
    for (let x = 0; x <= w; x += w / 12) {
      const dy = Math.sin((x / w) * Math.PI * 4 + i * 1.7) * 3 * scale
      if (x === 0) ctx.moveTo(x, yy + dy)
      else ctx.lineTo(x, yy + dy)
    }
    ctx.stroke()
  }

  // 经纬网格（极淡）
  ctx.strokeStyle = 'rgba(240, 236, 223, 0.05)'
  for (let gx = 0; gx <= 100; gx += 10) {
    ctx.beginPath(); ctx.moveTo(X(gx), 0); ctx.lineTo(X(gx), h); ctx.stroke()
  }
  for (let gy = 0; gy <= 100; gy += 10) {
    ctx.beginPath(); ctx.moveTo(0, Y(gy)); ctx.lineTo(w, Y(gy)); ctx.stroke()
  }

  // 大洲：浅海光晕 → 陆地填充 → 地形色斑（裁剪） → 海岸描边
  const terrainColors: Record<string, string> = { desert: c.desert, forest: c.forest, steppe: c.steppe, tundra: c.tundra }
  for (const cont of WORLD.continents) {
    smoothClosedPath(ctx, cont.polygon, X, Y)
    ctx.strokeStyle = c.halo
    ctx.lineWidth = 7 * scale
    ctx.stroke()
    ctx.fillStyle = c.land
    ctx.fill()
  }
  for (const cont of WORLD.continents) {
    ctx.save()
    smoothClosedPath(ctx, cont.polygon, X, Y)
    ctx.clip()
    for (const t of WORLD.terrains) {
      if (!pip(t.center, cont.polygon)) continue
      ctx.globalAlpha = 0.5
      ctx.fillStyle = terrainColors[t.kind]
      ctx.beginPath()
      ctx.ellipse(X(t.center[0]), Y(t.center[1]), X(t.rx), Y(t.ry), 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.restore()
    smoothClosedPath(ctx, cont.polygon, X, Y)
    ctx.strokeStyle = c.landEdge
    ctx.lineWidth = 1.4 * scale
    ctx.stroke()
  }

  // 河流（平滑曲线）
  ctx.strokeStyle = c.water
  ctx.lineWidth = 1.8 * scale
  ctx.lineCap = 'round'
  for (const river of WORLD.rivers) {
    smoothOpenPath(ctx, river.polyline, X, Y)
    ctx.stroke()
  }

  // 湖泊
  ctx.fillStyle = c.water
  for (const lake of WORLD.lakes) {
    ctx.beginPath()
    ctx.ellipse(X(lake.center[0]), Y(lake.center[1]), X(lake.rx), Y(lake.ry), 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // 山脉：连绵雪顶峰序
  for (const range of WORLD.ranges) {
    for (let i = 0; i < range.polyline.length - 1; i++) {
      const [x1, y1] = range.polyline[i]
      const [x2, y2] = range.polyline[i + 1]
      const steps = 6
      for (let s = 0; s <= steps; s++) {
        const x = x1 + ((x2 - x1) * s) / steps
        const y = y1 + ((y2 - y1) * s) / steps
        const r = 3.2 * scale
        // 山影
        ctx.strokeStyle = 'rgba(40, 44, 38, 0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(X(x) - r, Y(y) + r * 0.7)
        ctx.lineTo(X(x) + r * 1.1, Y(y) + r * 0.7)
        ctx.stroke()
        // 峰体 + 雪顶
        ctx.beginPath()
        ctx.moveTo(X(x) - r, Y(y) + r * 0.7)
        ctx.lineTo(X(x), Y(y) - r)
        ctx.lineTo(X(x) + r, Y(y) + r * 0.7)
        ctx.closePath()
        ctx.fillStyle = c.mountain
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(X(x) - r * 0.34, Y(y) - r * 0.1)
        ctx.lineTo(X(x), Y(y) - r)
        ctx.lineTo(X(x) + r * 0.34, Y(y) - r * 0.1)
        ctx.closePath()
        ctx.fillStyle = c.mountainSnow
        ctx.fill()
      }
    }
  }

  // 区域标记：发源地菱形 + 名字（描边字），当前文明红圈
  const fontSize = Math.max(10, 11 * scale)
  ctx.font = `${fontSize}px system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  for (const region of WORLD.regions) {
    const selectable = opts.selectable?.includes(region) ?? true
    const selected = opts.selectedId === region.id
    const isCurrent = opts.currentId === region.id
    const px = X(region.pos[0])
    const py = Y(region.pos[1])
    const r = (selected ? 6 : 4.5) * scale
    if (isCurrent) {
      ctx.strokeStyle = c.current
      ctx.lineWidth = 1.6 * scale
      ctx.beginPath(); ctx.arc(px, py, r + 4 * scale, 0, Math.PI * 2); ctx.stroke()
      ctx.globalAlpha = 0.35
      ctx.beginPath(); ctx.arc(px, py, r + 7.5 * scale, 0, Math.PI * 2); ctx.stroke()
      ctx.globalAlpha = 1
    }
    // 菱形标记
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = selected ? c.selected : (selectable || isCurrent ? c.regionOk : c.regionLocked)
    const rr = r * 0.72
    ctx.fillRect(-rr, -rr, rr * 2, rr * 2)
    ctx.restore()
    // 名字：描边字保证可读
    ctx.lineWidth = 3 * scale
    ctx.strokeStyle = 'rgba(34, 38, 34, 0.85)'
    ctx.textAlign = 'left'
    ctx.strokeText(region.name, px + 8 * scale, py)
    ctx.fillStyle = '#f0ecdf'
    ctx.fillText(region.name, px + 8 * scale, py)
  }
}

/** 点击命中检测：返回命中的区域（默认全部区域可选，阈值按画布宽度自适应） */
export function hitRegion(canvas: HTMLCanvasElement, ev: MouseEvent, selectable: RegionDef[]): RegionDef | null {
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const px = ((ev.clientX - rect.left) * sx * 100) / canvas.width
  const py = ((ev.clientY - rect.top) * sy * 100) / canvas.height
  const threshold = 5
  let best: { r: RegionDef; d: number } | null = null
  for (const r of selectable) {
    const d = Math.hypot(r.pos[0] - px, r.pos[1] - py)
    if (d < threshold && (!best || d < best.d)) best = { r, d }
  }
  return best?.r ?? null
}
