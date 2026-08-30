// 真实世界地图像素化管线（构建工具，一次性产出静态资产）
// 数据：Natural Earth 110m（public domain，经 world-atlas@2 分发）
// 输出：public/art-preview/map-*.png 候选风格供选择
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const W = 960, H = 480
const DATA_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json'
const CACHE = '/tmp/land-110m.json'

// ── 1. 数据获取 ──────────────────────────────────────────────
async function fetchData() {
  if (fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'))
  console.log('下载 land-110m.json ...')
  const r = await fetch(DATA_URL)
  const json = await r.json()
  fs.writeFileSync(CACHE, JSON.stringify(json))
  return json
}

// ── 2. TopoJSON 解码（delta+量化 → [lon,lat] ring）───────────
function decodeTopo(topo) {
  const { scale, translate } = topo.transform
  const arcs = topo.arcs.map(a => {
    const pts = []
    let x = 0, y = 0
    for (const [dx, dy] of a) {
      x += dx; y += dy
      pts.push([x * scale[0] + translate[0], y * scale[1] + translate[1]])
    }
    return pts
  })
  const ringsOf = (arcIdxList) => {
    const ring = []
    for (const idx of arcIdxList) {
      const arc = idx < 0 ? arcs[~idx].slice().reverse() : arcs[idx]
      ring.push(...(ring.length ? arc.slice(1) : arc))
    }
    return ring
  }
  const polygons = []
  for (const g of topo.objects.land.geometries) {
    if (g.type === 'Polygon') polygons.push({ rings: g.arcs.map(ringsOf) })
    else if (g.type === 'MultiPolygon') for (const arcs of g.arcs) polygons.push({ rings: arcs.map(ringsOf) })
  }
  // 剔除极小岛（面积 < 0.05 平方度）减少噪点
  return polygons.filter(p => {
    const area = ringArea(p.rings[0])
    return area > 0.05
  })
}
function ringArea(ring) {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

// ── 3. 投影（等距圆柱 2:1）───────────────────────────────────
const projX = (lon) => ((lon + 180) / 360) * W
const projY = (lat) => ((90 - lat) / 180) * H

// ── 4. scanline 光栅化（winding 规则填充陆地/海洋）───────────
// 返回 pixel 数组：1=陆地 0=海洋
function rasterize(polygons) {
  const land = new Uint8Array(W * H)
  // 边表：对每个 ring 生成 (y0,y1,x0,dxdy)，y 按投影整数行
  const edges = []
  for (const poly of polygons) {
    for (const ring of poly.rings) {
      for (let i = 0; i < ring.length; i++) {
        const [lon1, lat1] = ring[i]
        const [lon2, lat2] = ring[(i + 1) % ring.length]
        const y1 = projY(lat1), y2 = projY(lat2)
        if (y1 === y2) continue
        const x1 = projX(lon1), x2 = projX(lon2)
        const ymin = Math.min(y1, y2), ymax = Math.max(y1, y2)
        // 只考虑扫过整数 row 的边；winding：lat 下降(向北 y↓)逆时针为正
        const dir = y2 > y1 ? 1 : -1
        edges.push({ ymin, ymax, xAtYmin: y2 > y1 ? x1 : x2, dxdy: (x2 - x1) / (y2 - y1), dir })
      }
    }
  }
  for (let y = 0; y < H; y++) {
    const ys = y + 0.5
    const act = []
    for (const e of edges) {
      if (e.ymin <= ys && e.ymax > ys) act.push(e)
    }
    if (!act.length) continue
    act.sort((a, b) => a.xAtYmin + (ys - a.ymin) * a.dxdy - (b.xAtYmin + (ys - b.ymin) * b.dxdy))
    let winding = 0
    const xs = []
    for (const e of act) {
      winding += e.dir
      xs.push(e.xAtYmin + (ys - e.ymin) * e.dxdy)
    }
    // 稳定：按 x 排序依据 winding 变化点
    const pts = act.map((e, i) => [e.xAtYmin + (ys - e.ymin) * e.dxdy, e.dir]).sort((a, b) => a[0] - b[0])
    let acc = 0
    let prevX = -1
    for (const [x, d] of pts) {
      if (acc !== 0) {
        const x0 = Math.max(0, Math.round(Math.max(prevX, 0)))
        const x1 = Math.min(W - 1, Math.round(x))
        for (let px = x0; px < x1; px++) land[y * W + px] = 1
      }
      acc += d
      prevX = x
    }
  }
  return land
}

// ── 5. biome 规则着色（纬度带 + 经度干燥带 + 噪声斑块）───────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function biomeAt(lat, lon, rnd) {
  const al = Math.abs(lat)
  if (al > 66) return 'tundra'          // 极地
  if (al > 55) return rnd() < 0.55 ? 'taiga' : 'tundra'
  if (al > 40) return 'forest'          // 温带
  // 热带：干燥带（纬度 15-30 受副高压控制，大陆西侧/内陆更干）
  if (al < 12) return rnd() < 0.72 ? 'jungle' : 'steppe'
  if (al < 25) return rnd() < 0.75 ? 'desert' : 'steppe'
  if (al < 40) return rnd() < 0.4 ? 'desert' : 'steppe'
  return 'steppe'
}

// ── 6. 风格渲染 ──────────────────────────────────────────────
const PALETTES = {
  ocean: { // 风格 A：海图风（Civ strategy 参考）
    sea: [46, 82, 104], seaDeep: [34, 62, 82], seaHi: [58, 100, 122],
    land: [116, 128, 92], coast: [232, 226, 205],
    jungle: [74, 108, 64], forest: [94, 118, 70], steppe: [154, 163, 96],
    desert: [196, 173, 116], tundra: [146, 154, 142], taiga: [88, 106, 84],
    grid: [255, 255, 255],
  },
  parchment: { // 风格 B：古籍羊皮纸
    sea: [182, 162, 122], seaDeep: [168, 148, 108], seaHi: [196, 176, 136],
    land: [210, 194, 150], coast: [122, 96, 64],
    jungle: [134, 148, 96], forest: [148, 154, 106], steppe: [196, 180, 130],
    desert: [216, 194, 140], tundra: [204, 200, 176], taiga: [158, 156, 112],
    grid: [90, 70, 48],
  },
}

function render(pal, land, label) {
  const png = new PNG({ width: W, height: H })
  const rnd = mulberry32(20260830)
  // 预生成每格 biome（用 2×2 块降噪：以像素中心经纬）
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const lat = 90 - ((y + 0.5) / H) * 180
      const lon = ((x + 0.5) / W) * 360 - 180
      let [r, g, b] = pal.sea
      if (land[i]) {
        const bm = biomeAt(lat, lon, () => rnd())
        const c = pal[bm] ?? pal.land
        ;[r, g, b] = c
        // 海岸线提亮（相邻有海）
        const isCoast = [i - 1, i + 1, i - W, i + W].some(j => j >= 0 && j < W * H && !land[j])
        if (isCoast && rnd() < 0.5) { r = pal.coast[0]; g = pal.coast[1]; b = pal.coast[2] }
      } else if (rnd() < 0.5) {
        ;[r, g, b] = pal.seaDeep
      }
      png.data[i * 4] = r; png.data[i * 4 + 1] = g; png.data[i * 4 + 2] = b; png.data[i * 4 + 3] = 255
    }
  }
  // 经纬网格
  const gridC = pal.grid
  for (let y = 0; y < H; y += 80) for (let x = 0; x < W; x++) { const i = y * W + x; png.data[i * 4 + 3] = 255; if (x % 2 === 0) { png.data[i * 4] = gridC[0] | 0; png.data[i * 4 + 1] = gridC[1] | 0; png.data[i * 4 + 2] = gridC[2] | 0 } }
  for (let x = 0; x < W; x += 96) for (let y = 0; y < H; y++) { const i = y * W + x; if (y % 2 === 0) { png.data[i * 4] = gridC[0] | 0; png.data[i * 4 + 1] = gridC[1] | 0; png.data[i * 4 + 2] = gridC[2] | 0 } }
  const out = path.join('public/art-preview', `map-${label}.png`)
  fs.writeFileSync(out, PNG.sync.write(png))
  console.log('写出', out, fs.statSync(out).size, 'bytes')
}

// ── 主流程 ───────────────────────────────────────────────────
const topo = await fetchData()
console.log('数据就绪', Object.keys(topo.objects))
const polys = decodeTopo(topo)
console.log('大洲/岛屿多边形数（>0.05°²）:', polys.length)
const t0 = Date.now()
const land = rasterize(polys)
console.log('光栅化完成', Date.now() - t0, 'ms，陆地像素', land.reduce((a, b) => a + b, 0))
render(PALETTES.ocean, land, 'a-ocean')
render(PALETTES.parchment, land, 'b-parchment')