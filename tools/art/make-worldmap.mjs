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

// ── 5. 噪声与距离场 ──────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function makeNoise(seed) {
  const rand = mulberry32(seed)
  const perm = new Uint8Array(512)
  const table = new Float32Array(512)
  for (let i = 0; i < 256; i++) { perm[i] = i; table[i] = rand() }
  for (let i = 0; i < 256; i++) { const j = Math.floor(rand() * 256); const t = perm[i]; perm[i] = perm[j]; perm[j] = t }
  for (let i = 0; i < 256; i++) { perm[i + 256] = perm[i]; table[i + 256] = table[i] }
  const smooth = t => t * t * (3 - 2 * t)
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y)
    const xf = x - xi, yf = y - yi
    const u = smooth(xf), v = smooth(yf)
    const a = table[perm[(perm[xi & 255] + (yi & 255)) & 255]]
    const b = table[perm[(perm[(xi + 1) & 255] + (yi & 255)) & 255]]
    const cc = table[perm[(perm[xi & 255] + ((yi + 1) & 255)) & 255]]
    const d = table[perm[(perm[(xi + 1) & 255] + ((yi + 1) & 255)) & 255]]
    return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v
  }
  const fbm = (x, y, oct) => {
    let s = 0, amp = 0.5, freq = 1
    for (let i = 0; i < oct; i++) { s += n(x * freq, y * freq) * amp; freq *= 2.1; amp *= 0.52 }
    return Math.max(0, Math.min(1, s))
  }
  return { n, fbm }
}

// 距离场（chamfer 两遍扫描）：invert=false → 距陆地距离（海洋深度）；invert=true → 距海岸的陆地距离（内陆干旱度）
function distField(land, w, h, invert = false) {
  const INF = 1e6
  const d = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) d[i] = (invert ? !land[i] : land[i]) ? 0 : INF
  for (let y = 1; y < h; y++) for (let x = 1; x < w; x++) {
    const i = y * w + x
    d[i] = Math.min(d[i], d[i - 1] + 1, d[i - w] + 1, d[i - w - 1] + 1.41)
  }
  for (let y = h - 2; y >= 0; y--) for (let x = w - 2; x >= 0; x--) {
    const i = y * w + x
    d[i] = Math.min(d[i], d[i + 1] + 1, d[i + w] + 1, d[i + w + 1] + 1.41)
  }
  return d
}

// 逻辑分辨率：2×2 像素簇 → 最终画布
const LW = W / 2, LH = H / 2

// ── 6. 自然地形生成（fBm 高程/湿度 + 距离场 + 纬度）────────
// 每逻辑格输出 biome 与海拔
function genTerrain(land) {
  const noiseH = makeNoise(20260831)
  const noiseR = makeNoise(20260901)
  const noiseD = makeNoise(20260902)
  const biomes = new Array(LW * LH)
  const heiArr = new Float32Array(LW * LH)
  const humArr = new Float32Array(LW * LH)
  const d = distField(land, W, H)
  const dLand = distField(land, W, H, true)
  const maxD = 90 // 归一化长度（像素）
  // 知名山系中心点（经度, 纬度, 半径°, 权重）——增强真实感
  const RANGES = [
    [-72, -32, 6, 0.55], [-77, 4, 4, 0.5], [-70, -10, 4, 0.52], [-72, -20, 5, 0.52], // 安第斯三段
    [-105, 38, 8, 0.42], [-122, 49, 3.5, 0.42],                                    // 落基山/海岸山
    [86, 29, 10, 0.52], [75, 34, 7, 0.46], [55, 31, 6, 0.42], [104, 26, 6, 0.44],   // 喜马拉雅/帕米尔/扎格罗斯/横断
    [8, 46, 5, 0.44], [22, 44, 3.5, 0.4], [-7, 37, 3.5, 0.4], [36, 4, 4, 0.4], [120, 25, 4, 0.42], // 阿尔卑斯/喀尔巴阡/伊比利亚/东非裂谷/华东丘陵
    [80, 42, 4, 0.48], [69, 38, 4, 0.44], [60, 62, 4, 0.42],                         // 天山/兴都库什/乌拉尔
    [150, -6, 3, 0.44], [170, -44, 4, 0.42], [-114, 62, 4, 0.42], [146, 62, 4, 0.42], [15, 68, 6, 0.44], // 新几内亚/新西兰/阿拉斯加/鄂霍茨克山/斯堪的纳维亚
  ]
  const lat0 = 90 - ((0.5) / LH) * 180
  for (let y = 0; y < LH; y++) {
    const lat = 90 - ((y + 0.5) / LH) * 180
    for (let x = 0; x < LW; x++) {
      const i = y * LW + x
      const lon = ((x + 0.5) / LW) * 360 - 180
      const lx = (x + 0.5) / LW, ly = (y + 0.5) / LH
      // 大尺度高程（山脉带）+ 中尺度起伏
      let hei = noiseH.fbm(lx * 3.1, ly * 3.1, 5) * 0.72 + noiseR.fbm(lx * 9, ly * 9, 3) * 0.28
      // 基线重映射：fbm 中心 ~0.48 偏高，压到低地 ~0.1-0.3、山地 0.5+ 的合理尺度
      hei = Math.max(0, (hei - 0.34) / 0.62)
      // 山系叠加（高斯衰减，权重分档）
      for (const [rl, tl, r, w] of RANGES) {
        const dlon = Math.min(Math.abs(lon - rl), 360 - Math.abs(lon - rl))
        const dlat = lat - tl
        const dd = Math.sqrt(dlon * dlon + dlat * dlat) / r
        if (dd < 1.3) hei += Math.exp(-dd * dd * 1.15) * w
      }
      hei = Math.min(1, hei)
  // 湿度：近岸湿润 + 噪声扰动（大陆内部干燥）
      const seaDist = Math.min(1, dLand[(y * 2) * W + (x * 2)] / 9)
      let hum = Math.max(0, Math.min(1, (1 - seaDist) * 0.6 + noiseD.fbm(lx * 7, ly * 7, 3) * 0.34 - 0.1))
      // 真实大型沙漠带（副热带高压 + 内陆）：湿度压制
      const DESERTS = [
        [20, 22, 16], [45, 24, 10], [105, 43, 15], [82, 38, 7], [58, 30, 6], // 撒哈拉/阿拉伯/戈壁/塔克拉玛干/波斯湾�?
        [24, -23, 9], [134, -24, 14], [-70, -24, 4], [60, 28, 6], [72, 30, 5], // 卡拉哈里/澳洲内陆/阿塔卡玛/塔尔/塔尔沙漠西
      ]
      for (const [el, tl, r] of DESERTS) {
        const dlon = Math.min(Math.abs(lon - el), 360 - Math.abs(lon - el))
        const dd = Math.sqrt(dlon * dlon + (lat - tl) ** 2) / r
        if (dd < 1.5) hum -= Math.exp(-dd * dd * 1.5) * 0.68
      }
      // 真实雨林带（赤道低压 + 季风）：湿度加持
      const JUNGLES = [
        [-60, -3, 15], [23, 0, 12], [115, -2, 13], [103, -5, 8], [15, -10, 6],
      ]
      for (const [el, tl, r] of JUNGLES) {
        const dlon = Math.min(Math.abs(lon - el), 360 - Math.abs(lon - el))
        const dd = Math.sqrt(dlon * dlon + (lat - tl) ** 2) / r
        if (dd < 1.5) hum += Math.exp(-dd * dd * 1.2) * 0.48
      }
      // 冲积绿洲带（两河/尼罗河谷）：人工灌溉平原，草原而非荒漠
      const OASES = [[45, 33, 3.5], [31, 28, 3.5]]
      for (const [el, tl, r] of OASES) {
        const dlon = Math.min(Math.abs(lon - el), 360 - Math.abs(lon - el))
        const dd = Math.sqrt(dlon * dlon + (lat - tl) ** 2) / r
        if (dd < 1.5) hum += Math.exp(-dd * dd * 1.2) * 0.42
      }
      hum = Math.max(0, Math.min(1, hum))
      // 高纬湿度修正（蒸发弱 + 冻土湿地：西伯利亚/加拿大针叶林带）
      if (Math.abs(lat) > 50) hum += 0.17
      // 极地冰盖强制（南极/格陵兰）
      if (lat < -68 || (lat > 70 && lon > -75 && lon < -20)) hei = 0.99
      humArr[i] = hum
      heiArr[i] = hei
      biomes[i] = biomeOf(lat, hum, hei, noiseD)
    }
  }
  // 3×3 多数投票平滑 2 轮（消椒盐）
  const idx = (x, y) => y * LW + (x + LW) % LW
  for (let pass = 0; pass < 2; pass++) {
    const src = biomes.slice()
    for (let y = 1; y < LH - 1; y++) for (let x = 1; x < LW - 1; x++) {
      const votes = new Map()
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const v = src[idx(x + dx, y + dy)]
        const base = v.startsWith('rock') ? 'rock' : v.startsWith('snow') ? 'snow' : v
        votes.set(base, (votes.get(base) ?? 0) + 1)
      }
      let best = src[y * LW + x], bestN = 1
      for (const [k, n] of votes) if (n > bestN) { best = k; bestN = n }
      biomes[y * LW + x] = best
    }
  }
  return { biomes, heiArr, humArr }
}

function biomeOf(lat, hum, hei, noise) {
  const al = Math.abs(lat)
  // 极地冰盖
  if (hei > 0.9) return 'snow'
  // 高山：岩/雪（低纬雪线更高）
  if (hei > 0.72) return al > 26 ? 'snow' : 'rock'
  if (hei > 0.58) return 'rock'
  if (hei > 0.5) return 'steppe'
  // 低地：纬向气候 + 湿度
  if (al > 64) return 'tundra'
  if (al > 52) return hum > 0.3 ? 'taiga' : 'tundra'
  if (al > 34) return hum > 0.38 ? 'forest' : 'steppe'
  if (al < 9) return hum > 0.42 ? 'jungle' : 'steppe'
  if (al < 22) return hum < 0.26 ? 'desert' : (hum < 0.55 ? 'steppe' : 'forest')
  if (al < 34) return hum < 0.2 ? 'desert' : (hum < 0.48 ? 'steppe' : 'forest')
  if (al < 50) return hum < 0.3 ? 'desert' : (hum < 0.45 ? 'steppe' : 'forest')
  return hum < 0.34 ? 'desert' : 'steppe'
}

// ── 8. 风格渲染 ──────────────────────────────────────────────
const PALETTES = {
  ocean: { // 风格 A：海图风（Civ strategy 参考）
    sea: [64, 106, 126], seaDeep: [40, 70, 92], seaAbyss: [28, 50, 68], seaHi: [92, 134, 148], shoal: [110, 152, 158],
    land: [128, 140, 96], coast: [232, 226, 205],
    jungle: [70, 106, 62], forest: [96, 122, 74], steppe: [162, 168, 100],
    desert: [200, 178, 120], tundra: [150, 152, 140], taiga: [90, 112, 86],
    rock: [128, 118, 106], snow: [240, 240, 234],
    hill: [168, 158, 104], mount: [186, 146, 98], grid: [255, 255, 255],
  },
  parchment: { // 风格 B：古籍羊皮纸
    sea: [182, 162, 122], seaDeep: [168, 148, 108], seaAbyss: [150, 130, 96], seaHi: [196, 176, 136], shoal: [204, 182, 140],
    land: [210, 194, 150], coast: [122, 96, 64],
    jungle: [134, 148, 96], forest: [148, 154, 106], steppe: [196, 180, 130],
    desert: [216, 194, 140], tundra: [204, 200, 176], taiga: [158, 156, 112],
    rock: [172, 160, 140], snow: [236, 234, 220],
    hill: [200, 178, 128], mount: [186, 158, 112], grid: [90, 70, 48],
  },
}

const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t))

function render(pal, land, label) {
  const { biomes, heiArr, humArr } = genTerrain(land)
  if (process.env.DEBUG === '1') {
    const hist = new Array(10).fill(0)
    let cnt = 0
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      if (!land[(y * 2) * W + (x * 2)]) continue
      hist[Math.min(9, Math.floor(humArr[y * LW + x] * 10))]++
      cnt++
    }
    console.log('hum 直方图(陆地):', hist.map((v, i) => `${i / 10}-${(i + 1) / 10}:${(v / cnt * 100).toFixed(1)}%`).join(' '))
  }
  const png = new PNG({ width: W, height: H })
  const rnd = mulberry32(20260832)
  const d = distField(land, W, H)
  const noiseW = makeNoise(20260903)
  // 2×2 像素簇上采样
  for (let gy = 0; gy < LH; gy++) {
    for (let gx = 0; gx < LW; gx++) {
      const gi = gy * LW + gx
      const lat = 90 - ((gy + 0.5) / LH) * 180
      let [r, g, b] = [0, 0, 0]
      if (land[(gy * 2) * W + (gx * 2)]) {
        const hei = heiArr[gi]
        let bm = biomes[gi]
        if (bm === 'snow' && Math.abs(lat) < 26) bm = 'rock' // 低纬雪线压制
        // 气候底色（biome）
        let col = pal[bm] ?? pal.land
        // 海拔分层设色（hypsometric tint）：低地平坦 → 丘陵黄绿 → 山地棕 → 雪线白
        if (hei > 0.26) col = mix(col, pal.hill, Math.min(1, (hei - 0.26) / 0.2))
        if (hei > 0.46) col = mix(col, pal.mount, Math.min(1, (hei - 0.46) / 0.2))
        if (hei > 0.66) col = mix(col, pal.snow, Math.min(1, (hei - 0.66) / 0.16))
        // 微明度起伏 + 植被材质点
        const f = 0.95 + Math.min(0.55, hei) * 0.1
        ;[r, g, b] = col.map(v => Math.round(v * f))
        if (bm === 'forest' || bm === 'jungle' || bm === 'taiga') {
          const sp = noiseW.fbm((gx + 7.3) * 0.22, (gy + 2.9) * 0.22, 2)
          if (sp > 0.68) { r = Math.round(r * 0.88); g = Math.round(g * 0.88); b = Math.round(b * 0.88) }
          else if (sp < 0.3) { r = Math.round(r * 1.1); g = Math.round(g * 1.1); b = Math.round(b * 1.1) }
        } else if (bm === 'desert' || bm === 'steppe') {
          const sp = noiseW.n(gx * 0.9, gy * 0.9)
          if (sp > 0.62) { g = Math.round(g * 0.95) }
        } else if (bm === 'rock') {
          const sp = noiseW.n(gx * 1.3, gy * 1.3)
          if (sp > 0.55) { r -= 10; g -= 10; b -= 10 }
        }
      } else {
        // 海洋 bathymetry 分层渐变（浅滩/浅海/深海/深渊）+ 波纹
        const dd = Math.min(2.2, d[gy * 2 * W + gx * 2] / 13)
        let col
        if (dd < 0.18) col = mix(pal.shoal, pal.sea, dd / 0.18)
        else if (dd < 1) col = mix(pal.sea, pal.seaDeep, (dd - 0.18) / 0.82)
        else col = mix(pal.seaDeep, pal.seaAbyss, Math.min(1, (dd - 1) * 0.9))
        ;[r, g, b] = col
        const wv = noiseW.n(gx * 0.35, gy * 0.35)
        if (wv > 0.62 && dd > 0.3) { r = Math.round(r * 0.95); g = Math.round(g * 0.95); b = Math.round(b * 0.95) }
        if (dd < 0.12 && noiseW.n(gx * 1.1, gy * 1.1) > 0.55) { r = Math.round(r * 1.06); g = Math.round(g * 1.06); b = Math.round(b * 1.06) } // 浅滩亮斑
      }
      // 海岸细线：子像素级 8 邻域判定，1px 柔和暗线（无大面积高亮）
      const gb = land[(gy * 2) * W + (gx * 2)]
      let inSea = false // 标记当前格是否临海（用于陆地格微焰）
      for (let dy = 0; dy < 2 && !inSea; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = ((gy * 2 + dy) * W + (gx * 2 + dx)) * 4
        png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255
      }
      // 陆地临海格：整格微降饱和（暗化而非提亮）
      if (gb) {
        const isCoast = [gx * 2 + 2, gx * 2 - 2].some(x => x >= 0 && x < W && !land[(gy * 2) * W + x]) ||
          [gy * 2 + 2, gy * 2 - 2].some(y => y >= 0 && y < H && !land[y * W + gx * 2])
        if (isCoast) {
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const i = ((gy * 2 + dy) * W + (gx * 2 + dx)) * 4
            png.data[i] = Math.round(png.data[i] * 0.88)
            png.data[i + 1] = Math.round(png.data[i + 1] * 0.88)
            png.data[i + 2] = Math.round(png.data[i + 2] * 0.88)
          }
        }
      }
    }
  }
  // 经纬网格（极淡）
  const gridC = pal.grid
  for (let y = 0; y < H; y += 80) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    png.data[i] = (png.data[i] + gridC[0] * 0.18) | 0; png.data[i + 1] = (png.data[i + 1] + gridC[1] * 0.18) | 0; png.data[i + 2] = (png.data[i + 2] + gridC[2] * 0.18) | 0
  }
  for (let x = 0; x < W; x += 96) for (let y = 0; y < H; y++) {
    const i = (y * W + x) * 4
    png.data[i] = (png.data[i] + gridC[0] * 0.18) | 0; png.data[i + 1] = (png.data[i + 1] + gridC[1] * 0.18) | 0; png.data[i + 2] = (png.data[i + 2] + gridC[2] * 0.18) | 0
  }
  const out = path.join('public/art-preview', `map-${label}.png`)
  fs.writeFileSync(out, PNG.sync.write(png))
  console.log('写出', out, fs.statSync(out).size, 'bytes，陆地', (land.reduce((a, b) => a + b, 0) / (W * H) * 100).toFixed(1) + '%')
  // 统计输出（供无图环境质检）
  const stats = new Map()
  for (const bm of biomes) stats.set(bm, (stats.get(bm) ?? 0) + 1)
  console.log('biome 占比:', [...stats.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / (LW * LH) * 100).toFixed(1)}%`).join('  '))
  // 真实地理点位逐格确认
  const SPOTS = [
    ['撒哈拉', 20, 22], ['阿拉伯', 45, 24], ['戈壁', 105, 43], ['卡拉哈里', 24, -23], ['澳洲内陆', 134, -24], ['塔克拉玛干', 82, 38],
    ['亚马逊', -60, -3], ['刚果', 23, 0], ['印尼', 115, -2], ['西伯利亚针叶', 90, 60], ['中亚草原', 65, 45], ['北美大平原', -100, 42],
    ['安第斯', -70, -25], ['喜马拉雅', 86, 29], ['阿尔卑斯', 8, 46], ['南极', 0, -80], ['格陵兰', -45, 74], ['两河流域', 45, 33],
  ]
  for (const [name, lon, lat] of SPOTS) {
    const gx = Math.round(((lon + 180) / 360) * LW) % LW
    const gy = Math.round(((90 - lat) / 180) * LH)
    const gi = gy * LW + gx
    const onLand = land[(gy * 2) * W + (gx * 2)]
    console.log(`点位 ${name}(${lon}°,${lat}°) → ${onLand ? biomes[gi] : '海洋'} hei=${heiArr[gi].toFixed(2)}`)
  }
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