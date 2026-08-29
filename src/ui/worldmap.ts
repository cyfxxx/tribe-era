// 大世界地图（简略层）：大洲/山脉/河流/湖泊 + 区域标记，开局与远征选目标共用
import { WORLD, type RegionDef } from '../core/world'

export interface MapColors { sea: string; land: string; landEdge: string; mountain: string; water: string; regionOk: string; regionLocked: string; selected: string }

const DEFAULT: MapColors = { sea: '#3f5a6b', land: '#6f7d5a', landEdge: '#57644a', mountain: '#8d8d80', water: '#5b7f95', regionOk: '#d9a24a', regionLocked: '#7c7c6c', selected: '#e86a4a' }

export function drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, opts: { selectable?: RegionDef[]; selectedId?: string | null; colors?: Partial<MapColors> }): void {
  const c = { ...DEFAULT, ...opts.colors }
  const X = (x: number) => (x / 100) * w
  const Y = (y: number) => (y / 100) * h
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = c.sea
  ctx.fillRect(0, 0, w, h)

  // 大洲
  for (const cont of WORLD.continents) {
    ctx.beginPath()
    cont.polygon.forEach(([x, y], i) => i === 0 ? ctx.moveTo(X(x), Y(y)) : ctx.lineTo(X(x), Y(y)))
    ctx.closePath()
    ctx.fillStyle = c.land
    ctx.fill()
    ctx.strokeStyle = c.landEdge
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // 河流
  ctx.strokeStyle = c.water
  ctx.lineWidth = 1.6
  for (const river of WORLD.rivers) {
    ctx.beginPath()
    river.polyline.forEach(([x, y], i) => i === 0 ? ctx.moveTo(X(x), Y(y)) : ctx.lineTo(X(x), Y(y)))
    ctx.stroke()
  }

  // 湖泊
  ctx.fillStyle = c.water
  for (const lake of WORLD.lakes) {
    ctx.beginPath()
    ctx.ellipse(X(lake.center[0]), Y(lake.center[1]), X(lake.rx), Y(lake.ry), 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // 山脉（折线上的短斜杠）
  ctx.strokeStyle = c.mountain
  ctx.lineWidth = 1.4
  for (const range of WORLD.ranges) {
    for (let i = 0; i < range.polyline.length - 1; i++) {
      const [x1, y1] = range.polyline[i]
      const [x2, y2] = range.polyline[i + 1]
      const steps = 5
      for (let s = 0; s <= steps; s++) {
        const x = x1 + ((x2 - x1) * s) / steps
        const y = y1 + ((y2 - y1) * s) / steps
        ctx.beginPath()
        ctx.moveTo(X(x) - 2, Y(y) + 2)
        ctx.lineTo(X(x), Y(y) - 2)
        ctx.lineTo(X(x) + 2, Y(y) + 2)
        ctx.stroke()
      }
    }
  }

  // 区域标记
  ctx.font = '10px system-ui'
  for (const region of WORLD.regions) {
    const selectable = opts.selectable?.includes(region) ?? true
    const selected = opts.selectedId === region.id
    ctx.fillStyle = selected ? c.selected : (selectable ? c.regionOk : c.regionLocked)
    ctx.beginPath()
    ctx.arc(X(region.pos[0]), Y(region.pos[1]), selected ? 5 : 3.5, 0, Math.PI * 2)
    ctx.fill()
    if (selected || selectable) {
      ctx.fillStyle = '#f0ecdf'
      ctx.fillText(region.name, X(region.pos[0]) + 6, Y(region.pos[1]) + 3)
    }
  }
}

/** 点击命中检测：返回命中的可选区域 */
export function hitRegion(canvas: HTMLCanvasElement, ev: MouseEvent, selectable: RegionDef[]): RegionDef | null {
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const px = ((ev.clientX - rect.left) * sx * 100) / canvas.width
  const py = ((ev.clientY - rect.top) * sy * 100) / canvas.height
  let best: { r: RegionDef; d: number } | null = null
  for (const r of selectable) {
    const d = Math.hypot(r.pos[0] - px, r.pos[1] - py)
    if (d < 4 && (!best || d < best.d)) best = { r, d }
  }
  return best?.r ?? null
}
