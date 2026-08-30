// 人物/物品像素 sprite 候选生成（程序化模板 × 3 种画风）
// 输出 public/art-preview/sprites-people.png（6 种族 × 3 风格）与 sprites-items.png（8 物品 × 3 风格）
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

// ── 基础工具 ──────────────────────────────────────────────
function canvas(w, h) {
  const png = new PNG({ width: w, height: h })
  png.data.fill(0)
  const set = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255 }
  return { png, set }
}

// 种族档案：肤色(主) / 深色(描边/特征) / 特征类型
const RACES = [
  { id: 'fox', name: '狐', skin: [217, 122, 58], dark: [178, 92, 40], trait: 'earFox' },
  { id: 'cat', name: '猫', skin: [201, 160, 106], dark: [166, 126, 78], trait: 'earCat' },
  { id: 'dog', name: '犬', skin: [122, 106, 90], dark: [96, 82, 68], trait: 'earDog' },
  { id: 'ox', name: '牛', skin: [106, 79, 58], dark: [82, 60, 42], trait: 'horn' },
  { id: 'hawk', name: '鹰', skin: [141, 141, 154], dark: [108, 108, 122], trait: 'crest' },
  { id: 'fish', name: '鱼', skin: [95, 143, 154], dark: [70, 110, 120], trait: 'fin' },
]

// 画风 1：简朴（头+身+腿，无特征） 2：特征鲜明 3：兜帽剪影
function drawPerson(set, style, skin, dark, trait) {
  const eye = [46, 40, 30]
  if (style === 3) {
    // 兜帽：头隐藏在帽中，只露 4×4 脸 + 大斗篷
    const cx = 8
    for (let y = 0; y < 7; y++) for (let x = 4; x < 12; x++) set(x, y, dark)   // 兜帽
    for (let y = 2; y < 5; y++) for (let x = 6; x < 10; x++) set(x, y, skin)   // 脸
    set(6, 3, eye); set(9, 3, eye)
    for (let y = 6; y < 13; y++) for (let x = 5; x < 11; x++) set(x, y, dark)  // 斗篷
    for (let y = 13; y < 16; y++) for (let x = 6; x < 10; x++) set(x, y, dark) // 下摆
    return
  }
  // 头（6×6 @3,0）
  const hx0 = 5, hy0 = 1
  for (let y = hy0; y < hy0 + 5; y++) for (let x = hx0; x < hx0 + 6; x++) set(x, y, skin)
  set(hx0 + 1, hy0 + 2, eye); set(hx0 + 4, hy0 + 2, eye)
  if (style >= 2) {
    if (trait === 'earFox' || trait === 'earCat') {
      // 三角耳
      set(hx0, hy0 - 1, skin); set(hx0 + 1, hy0 - 2, skin); set(hx0 + 2, hy0 - 1, skin) // 左耳
      set(hx0 + 3, hy0 - 1, skin); set(hx0 + 4, hy0 - 2, skin); set(hx0 + 5, hy0 - 1, skin) // 右耳
      set(hx0 + 1, hy0 - 1, dark); set(hx0 + 4, hy0 - 1, dark) // 内耳
    } else if (trait === 'earDog') {
      set(hx0, hy0 - 1, dark); set(hx0 + 1, hy0 - 1, dark); set(hx0 + 1, hy0 - 2, dark)
      set(hx0 + 4, hy0 - 1, dark); set(hx0 + 5, hy0 - 1, dark); set(hx0 + 4, hy0 - 2, dark)
    } else if (trait === 'horn') {
      set(hx0, hy0 - 2, [232, 226, 205]); set(hx0 + 1, hy0 - 1, [200, 190, 170])
      set(hx0 + 4, hy0 - 2, [232, 226, 205]); set(hx0 + 5, hy0 - 1, [200, 190, 170])
    } else if (trait === 'crest') {
      set(hx0 + 2, hy0 - 1, dark); set(hx0 + 3, hy0 - 2, dark); set(hx0 + 2, hy0 - 2, dark); set(hx0 + 3, hy0 - 3, dark)
    } else if (trait === 'fin') {
      set(hx0 + 2, hy0 - 2, skin); set(hx0 + 3, hy0 - 2, skin); set(hx0 + 2, hy0 - 1, skin)
    }
  }
  // 身体（8×7 @4,6）
  for (let y = 6; y < 12; y++) for (let x = 4; x < 12; x++) set(x, y, skin)
  set(5, 7, dark); set(10, 7, dark) // 手臂分界
  // 腰带
  for (let x = 4; x < 12; x++) set(x, 11, dark)
  // 腿（@5,12）
  for (let y = 12; y < 15; y++) set(5 + 1, y, dark)
  for (let y = 12; y < 15; y++) set(9, y, dark)
}

const ITEMS = [
  { id: 'fire', name: '篝火', rects: [[4, 4, 8, 6, [217, 105, 63]], [6, 2, 4, 3, [232, 146, 74]], [7, 8, 2, 4, [90, 62, 44]], [5, 12, 6, 2, [62, 44, 34]]] },
  { id: 'axe', name: '石斧', rects: [[2, 3, 2, 10, [138, 98, 68]], [4, 1, 6, 6, [138, 147, 163]], [5, 2, 3, 4, [174, 182, 196]]] },
  { id: 'pot', name: '陶罐', rects: [[5, 3, 6, 2, [201, 144, 94]], [6, 5, 4, 5, [181, 122, 76]], [7, 10, 2, 2, [160, 106, 64]], [5, 5, 1, 3, [216, 168, 120]]] },
  { id: 'kiln', name: '窑', rects: [[3, 5, 10, 8, [154, 125, 90]], [3, 5, 10, 2, [106, 86, 62]], [5, 9, 6, 2, [86, 66, 46]], [7, 6, 2, 2, [216, 168, 120]]] },
  { id: 'hut', name: '棚屋', rects: [[3, 6, 10, 6, [176, 145, 104]], [2, 4, 12, 2, [201, 136, 79]], [5, 1, 6, 4, [138, 74, 42]], [6, 8, 3, 4, [90, 62, 44]]] },
  { id: 'copper', name: '铜锭', rects: [[3, 6, 10, 3, [217, 140, 73]], [4, 9, 8, 2, [201, 122, 58]], [4, 5, 8, 1, [240, 168, 106]]] },
  { id: 'bronzeAxe', name: '青铜斧', rects: [[2, 3, 2, 10, [138, 98, 68]], [4, 1, 8, 7, [176, 129, 82]], [5, 2, 6, 5, [201, 155, 110]], [6, 3, 3, 3, [226, 185, 145]], [11, 3, 2, 3, [138, 90, 58]]] },
  { id: 'field', name: '粮田', rects: [[2, 9, 12, 4, [106, 88, 60]], [3, 7, 2, 2, [125, 163, 80]], [8, 6, 2, 2, [125, 163, 80]], [12, 5, 2, 2, [142, 186, 94]], [5, 4, 2, 2, [142, 186, 94]]] },
]

function drawItem(set, style, rects) {
  for (const [x, y, w, h, c] of rects) {
    if (style === 2) {
      // 深色描边：外扩一圈变暗
      const dark = c.map(v => Math.round(v * 0.55))
      for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) {
        if (dx === -1 || dy === -1 || dx === w || dy === h) set(x + dx, y + dy, dark)
      }
    }
    if (style === 3) {
      // 斜面：上半亮 下半暗
      const hi = c.map(v => Math.min(255, Math.round(v * 1.25)))
      const lo = c.map(v => Math.round(v * 0.75))
      for (let dy = 0; dy < Math.ceil(h / 2); dy++) for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, hi)
      for (let dy = Math.ceil(h / 2); dy < h; dy++) for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, lo)
      continue
    }
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, c)
  }
}

// ── 输出 sheet ────────────────────────────────────────────
const PX = 4 // 每 sprite 放大 4 倍显示（像素格子），PNG 本身不放大：用 CSS
// 直接输出原生尺寸 sheet，浏览器 CSS 放大
{
  const cols = RACES.length, rows = 3, cw = 16, ch = 18
  const c = canvas(cols * cw, rows * ch)
  RACES.forEach((race, ci) => {
    for (let style = 1; style <= 3; style++) {
      const ox = ci * cw, oy = (style - 1) * ch
      const set = (x, y, col) => c.set(ox + x, oy + y, col)
      drawPerson(set, style, race.skin, race.dark, race.trait)
    }
  })
  fs.writeFileSync('public/art-preview/sprites-people.png', PNG.sync.write(c.png))
  console.log('写出 sprites-people.png')
}
{
  const cols = ITEMS.length, rows = 3, cw = 16, ch = 16
  const c = canvas(cols * cw, rows * ch)
  ITEMS.forEach((item, ci) => {
    for (let style = 1; style <= 3; style++) {
      const ox = ci * cw, oy = (style - 1) * ch
      const set = (x, y, col) => c.set(ox + x, oy + y, col)
      drawItem(set, style, item.rects)
    }
  })
  fs.writeFileSync('public/art-preview/sprites-items.png', PNG.sync.write(c.png))
  console.log('写出 sprites-items.png')
}