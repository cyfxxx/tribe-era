// 营地场景（像素风 Canvas）：建筑随建造出现、族人游走、昼夜与四季色调
import type { GameState } from '../sim'
import { seasonOfNow } from '../sim'
import { TIME } from '../core/seasons'

const SEASON_GROUND: Record<string, string> = { spring: '#6f8f4e', summer: '#7e9448', autumn: '#a08850', winter: '#c9ced2' }
const SEASON_TREE: Record<string, string> = { spring: '#5f9e50', summer: '#4f8e40', autumn: '#b0763e', winter: '#8d9398' }

export function drawCamp(ctx: CanvasRenderingContext2D, st: GameState, w: number, h: number): void {
  const season = seasonOfNow(st)
  const dayT = (st.time % TIME.secondsPerGameDay) / TIME.secondsPerGameDay // 0-1
  const night = Math.max(0, Math.sin((dayT - 0.5) * Math.PI * 2)) // 夜晚系数

  ctx.imageSmoothingEnabled = false
  // 天空/地面
  ctx.fillStyle = SEASON_GROUND[season]
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#4a4a3f'
  ctx.fillRect(0, 0, w, 12)

  // 树（四季色，固定位置伪随机）
  const trees = 14
  for (let i = 0; i < trees; i++) {
    const x = ((i * 73) % 100) / 100 * w
    const y = 20 + ((i * 37) % 60)
    ctx.fillStyle = SEASON_TREE[season]
    ctx.fillRect(x, y, 6, 10)
    ctx.fillStyle = '#5a4632'
    ctx.fillRect(x + 2, y + 10, 2, 4)
  }

  const cx = w / 2
  const cy = h * 0.62

  // 建筑：棚屋（三角）×n
  const huts = st.buildings.hut ?? 0
  for (let i = 0; i < Math.min(huts, 8); i++) {
    const x = cx - 150 + (i % 4) * 34
    const y = cy - 40 + Math.floor(i / 4) * 26
    ctx.fillStyle = '#8a6f4d'
    ctx.beginPath()
    ctx.moveTo(x, y + 14)
    ctx.lineTo(x + 12, y - 4)
    ctx.lineTo(x + 24, y + 14)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#5a4632'
    ctx.fillRect(x + 9, y + 6, 6, 8)
  }

  // 窑（方块+烟）
  if ((st.buildings.kiln ?? 0) > 0) {
    ctx.fillStyle = '#9a7d5a'
    ctx.fillRect(cx + 40, cy - 30, 18, 18)
    ctx.fillStyle = '#6a563e'
    ctx.fillRect(cx + 40, cy - 30, 18, 5)
    const smoke = (st.time % 3) / 3
    ctx.fillStyle = `rgba(200,200,200,${0.5 - smoke * 0.4})`
    ctx.fillRect(cx + 47 + Math.sin(st.time) * 3, cy - 38 - smoke * 14, 4, 4)
  }

  // 锻炉（灰块+红光）
  if ((st.buildings.furnace ?? 0) > 0) {
    ctx.fillStyle = '#777'
    ctx.fillRect(cx + 70, cy - 32, 20, 20)
    ctx.fillStyle = night > 0.2 || (st.time % 5) < 2.5 ? '#e86a4a' : '#a04a3a'
    ctx.fillRect(cx + 75, cy - 22, 10, 6)
  }

  // 祭坛（石堆）
  if ((st.buildings.shrine ?? 0) > 0) {
    ctx.fillStyle = '#9a9a92'
    ctx.fillRect(cx - 210, cy - 26, 6, 6)
    ctx.fillRect(cx - 202, cy - 30, 6, 10)
    ctx.fillRect(cx - 194, cy - 26, 6, 6)
  }

  // 地窖（土丘）
  if ((st.buildings.cellar ?? 0) > 0) {
    ctx.fillStyle = '#6a5a42'
    ctx.beginPath()
    ctx.ellipse(cx - 80, cy + 26, 14, 7, 0, Math.PI, 0)
    ctx.fill()
  }

  // 小田（绿条）
  const fields = st.buildings.field ?? 0
  for (let i = 0; i < Math.min(fields, 3); i++) {
    ctx.fillStyle = season === 'winter' ? '#8d9398' : '#5f9e50'
    for (let k = 0; k < 5; k++) ctx.fillRect(cx + 110 + i * 34 + k * 5, cy + 18 - (k % 2) * 2, 3, 10)
  }

  // 篝火（闪烁）
  const flicker = Math.sin(st.time * 6) * 0.5 + 0.5
  ctx.fillStyle = '#5a4632'
  ctx.fillRect(cx - 8, cy - 2, 16, 4)
  ctx.fillStyle = '#e8862a'
  ctx.fillRect(cx - 5, cy - 6 - flicker * 3, 10, 6 + flicker * 3)
  ctx.fillStyle = '#f4c542'
  ctx.fillRect(cx - 2, cy - 4 - flicker * 2, 4, 4)

  // 族人（游走小点）
  const RACES_COLORS: Record<string, string> = { fox: '#d97a3a', cat: '#c9a06a', dog: '#7a6a5a', ox: '#6a4f3a', hawk: '#8d8d9a', fish: '#5f8f9a' }
  const color = RACES_COLORS[st.raceId ?? 'fox']
  for (let i = 0; i < Math.min(st.pop, 20); i++) {
    const px = cx + Math.sin(st.time * 0.3 + i * 2.4) * (60 + (i % 4) * 22)
    const py = cy + Math.cos(st.time * 0.23 + i * 1.7) * (20 + (i % 3) * 10)
    ctx.fillStyle = color
    ctx.fillRect(px - 2, py - 4, 4, 6)
    ctx.fillStyle = '#3a3a33'
    ctx.fillRect(px - 2, py + 1, 4, 2)
  }

  // 远征队伍：营外小队列
  if (st.expedition) {
    ctx.fillStyle = '#c9c4b0'
    for (let i = 0; i < 3; i++) ctx.fillRect(30 + i * 8, h - 26 - i * 4, 4, 6)
    ctx.fillStyle = '#f0ecdf'
    ctx.font = '10px system-ui'
    ctx.fillText(`远征 → ${Math.ceil(st.expedition.left)}s`, 12, h - 8)
  }

  // 日月与晨昏（天空，随 dayT 移动）
  const sunX = w * (0.12 + dayT * 0.76)
  const sunY = h * (0.22 - Math.sin(dayT * Math.PI * 2) * 0.1)
  if (dayT > 0.06 && dayT < 0.94) {
    ctx.fillStyle = 'rgba(244, 210, 90, 0.25)'
    ctx.beginPath(); ctx.arc(sunX, sunY, 9, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#f4d25a'
    ctx.beginPath(); ctx.arc(sunX, sunY, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#e8b84a'
    ctx.fillRect(sunX - 1, sunY - 2, 2, 2)
  } else {
    ctx.fillStyle = 'rgba(216, 220, 224, 0.14)'
    ctx.beginPath(); ctx.arc(sunX, sunY, 7, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#d8dce0'
    ctx.beginPath(); ctx.arc(sunX, sunY, 4, 0, Math.PI * 2); ctx.fill()
  }
  // 晨昏暖光（黎明≈日 0.28、黄昏≈日 0.72）
  const dawnGlow = Math.max(0, 1 - Math.abs(dayT - 0.28) * 7)
  const duskGlow = Math.max(0, 1 - Math.abs(dayT - 0.72) * 7)
  const warm = Math.max(dawnGlow, duskGlow)
  if (warm > 0) {
    ctx.fillStyle = `rgba(240, 150, 70, ${warm * 0.14})`
    ctx.fillRect(0, 0, w, h)
  }

  // 夜色
  if (night > 0) {
    ctx.fillStyle = `rgba(20,24,48,${night * 0.45})`
    ctx.fillRect(0, 0, w, h)
  }
  // 冬雪
  if (season === 'winter') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (let i = 0; i < 24; i++) {
      const x = ((i * 53 + Math.floor(st.time * 12)) % 100) / 100 * w
      const y = ((i * 29 + Math.floor(st.time * 20)) % 100) / 100 * h
      ctx.fillRect(x, y, 2, 2)
    }
  }

  // 近期灾祸警示旗（营地右上缘，90 游戏秒内）
  let warn = false
  for (let i = st.log.length - 1; i >= 0 && st.log[i].t >= st.time - 90; i--) {
    if (st.log[i].cls === 'bad') { warn = true; break }
  }
  if (warn) {
    const fx = Math.min(cx + 165, w - 40)
    const fy = 40
    ctx.fillStyle = '#5a4632'
    ctx.fillRect(fx - 2, fy - 24, 2, 26)
    ctx.fillStyle = '#c06453'
    ctx.fillRect(fx, fy - 24, 13, 9)
    ctx.fillStyle = '#e8dcc0'
    ctx.fillRect(fx + 2, fy - 22, 7, 2)
    const puff = (st.time % 1.6) / 1.6
    ctx.fillStyle = `rgba(192, 100, 83, ${0.38 - puff * 0.22})`
    ctx.fillRect(fx + 9 + (puff > 0.5 ? 5 : 0), fy - 32 - puff * 20, 5, 5)
  }
}
