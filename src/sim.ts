// 模拟核心：与 DOM 完全解耦（headless 模拟器直接 import 本文件）
// v2：种族/区域/季节倍率、信仰与神迹、远征、事件、惯性治理钩子
import { BASE_CAPS, RES_MAP } from './data/resources'
import { TECH_MAP, OBSERVE_EVENTS, type Tech } from './data/techs'
import { BUILDING_MAP } from './data/buildings'
import { RECIPE_MAP, TRIAL_MAP } from './data/recipes'
import { TIME, seasonOf, SEASON_MODS, type Season } from './core/seasons'
import { RACE_MAP, type RaceDef } from './core/races'
import { REGION_MAP, type RegionDef } from './core/world'
import { govern } from './governor'
import { emit } from './core/events'

export interface LogEntry { t: number; cls: '' | 'bad' | 'good'; text: string }

export interface QueueItem {
  kind: 'recipe' | 'trial'
  id: string
  stepIdx: number
  stepT: number
  altUsed?: boolean
}

export interface GameState {
  version: number
  time: number
  res: Record<string, number>
  pop: number
  jobs: Record<string, number>
  techs: Record<string, boolean>
  buildings: Record<string, number>
  queue: QueueItem[]
  toolUse: Record<string, number>
  flags: Record<string, boolean>
  cards: string[]
  log: LogEntry[]
  // v2
  raceId?: string
  regionId?: string
  season?: Season
  faithBoostT?: number      // 神迹：灵感临时加成结束时刻（保留字段）
  autoManage?: boolean      // 神明放任惯性发展
  savedAt?: number          // 真实时间戳（离线推进用，Date.now）
  expedition?: { target: string; left: number } | null
  lastEventT?: number
  freeUnlocks?: boolean     // 通关后自由选区
}

export const SAVE_VERSION = 2

// ── 职业 ─────────────────────────────────────────────────────
export interface JobDef {
  id: string
  name: string
  res: string
  rate: number
  techReq?: string
  tool?: string[]
  /** 岗位可用条件：区域 tags 或种族 */
  needCoast?: boolean
}

export const JOBS: JobDef[] = [
  { id: 'gather',   name: '采集',  res: 'food',    rate: 0.5 },
  { id: 'wood',     name: '伐木',  res: 'wood',    rate: 0.35, tool: ['bronzeAxe', 'handAxe', 'crudeAxe'] },
  { id: 'stone',    name: '采石',  res: 'stone',   rate: 0.22 },
  { id: 'clay',     name: '挖粘土', res: 'clay',   rate: 0.25, techReq: 'fire4', tool: ['digStick'] },
  { id: 'fisher',   name: '捕鱼',  res: 'food',    rate: 0.45, needCoast: true },
  { id: 'research', name: '研究',  res: 'insight', rate: 0.1 },
]
export const JOB_MAP = new Map(JOBS.map(j => [j.id, j]))

const EAT_RATE = 0.12
const POP_BASE_CAP = 4
const BASE_FAITH_RATE = 0.02

/** 接纳族人的动态成本：人口越多摩擦越大（防指数滚雪球） */
export function admitCost(st: GameState): number {
  const r = raceOf(st)
  const base = 50 + 12 * Math.max(0, st.pop - 3)
  return Math.round(base * (2 - (r?.bonuses.grow ?? 1)))
}

export function raceOf(st: GameState): RaceDef | undefined {
  return st.raceId ? RACE_MAP.get(st.raceId as RaceDef['id']) : undefined
}

export function regionOf(st: GameState): RegionDef | undefined {
  return st.regionId ? REGION_MAP.get(st.regionId) : undefined
}

/** 种族加成倍率（key: research/gather/build/farm/fish/scout/grow/trade） */
export function raceMult(st: GameState, key: keyof RaceDef['bonuses']): number {
  return raceOf(st)?.bonuses[key] ?? 1
}

/** 区域 modifier 对资源的产出倍率 */
const REGION_MOD_EFFECTS: Record<string, Record<string, number>> = {
  alluvial: { food: 1.15 },
  nile_flood: { food: 1.1 },
  quarry: { stone: 1.15 },
  loess: { food: 1.05 },
  loess_clay: { clay: 1.15 },
  planning: { craft: 1.1 },
  fishery: { fish: 1.3 },
  flint_belt: { flint: 1.2 },
  timber_poor: { wood: 0.85 },
  trade_hub: {},
}

/** 区域加成聚合：指定资源或 craft（工序速度） */
export function regionMult(st: GameState, key: string): number {
  const region = regionOf(st)
  if (!region) return 1
  let m = 1
  for (const mod of region.modifiers) {
    const eff = REGION_MOD_EFFECTS[mod.key]?.[key]
    if (eff) m *= eff
  }
  return m
}

export function seasonOfNow(st: GameState): Season {
  return seasonOf(st.time / TIME.secondsPerGameDay)
}

// ── 初始状态（开局选择后创建）───────────────────────────────
export function createInitialState(raceId?: string, regionId?: string): GameState {
  const st: GameState = {
    version: SAVE_VERSION,
    time: 0,
    res: { food: 20, wood: 10, stone: 5, flint: 0, fiber: 5, clay: 0, copperOre: 0, tinOre: 0, copper: 0, bronze: 0, pottery: 0, insight: 0, faith: 0, crudeAxe: 0, handAxe: 0, digStick: 0, bronzeAxe: 0 },
    pop: 3,
    jobs: { gather: 3, wood: 0, stone: 0, clay: 0, fisher: 0, research: 0 },
    techs: {},
    buildings: {},
    queue: [],
    toolUse: {},
    flags: {},
    cards: [],
    log: [],
    raceId,
    regionId,
    autoManage: false,
    expedition: null,
    lastEventT: 0,
    freeUnlocks: false,
  }
  research(st, 'fire1', true)
  const race = raceOf(st)
  const region = regionOf(st)
  pushLog(st, '', `一小群${race ? race.name : '族人'}围着一堆篝火安顿下来${region ? `，这里是${region.name}` : ''}。火种要一直养着。`)
  return st
}

export function pushLog(st: GameState, cls: '' | 'bad' | 'good', text: string): void {
  st.log.push({ t: Math.floor(st.time), cls, text })
  if (st.log.length > 80) st.log.splice(0, st.log.length - 80)
}

// ── 派生值 ───────────────────────────────────────────────────
export function popCap(st: GameState): number {
  return POP_BASE_CAP + (st.buildings.hut ?? 0) * 4
}

export function resCap(st: GameState, res: string): number {
  let cap = BASE_CAPS[res] ?? 0
  if (res === 'food') {
    cap += (st.buildings.hut ?? 0) * 30
    cap += (st.buildings.cellar ?? 0) * 120
    if (st.techs.pottery3) cap += (st.res.pottery ?? 0) * 40
  }
  if (res === 'wood') cap += (st.buildings.cellar ?? 0) * 60
  if (res === 'faith') cap = 200
  if (res === 'insight') cap = 0
  return cap
}

/** 工具倍率：库存中 boost 最高者 */
const TOOL_BOOSTS: Record<string, number> = { crudeAxe: 1.3, handAxe: 1.6, digStick: 1.4, bronzeAxe: 2.0 }
export function toolBoost(st: GameState, tools: string[]): { mult: number; tool: string | null } {
  let best = { mult: 1, tool: null as string | null }
  for (const t of tools) {
    if ((st.res[t] ?? 0) > 0) {
      const boost = TOOL_BOOSTS[t] ?? 1
      if (boost > best.mult) best = { mult: boost, tool: t }
    }
  }
  return best
}

const TOOL_DUR: Record<string, number> = { crudeAxe: 300, handAxe: 480, digStick: 420, bronzeAxe: 900 }
const TOOL_NAMES: Record<string, string> = { crudeAxe: '砍砸器', handAxe: '手斧', digStick: '石铲', bronzeAxe: '青铜斧' }

export function jobAvailable(st: GameState, job: JobDef): boolean {
  if (job.techReq && !st.techs[job.techReq]) return false
  if (job.needCoast) {
    const region = regionOf(st)
    const race = raceOf(st)
    const coast = region?.tags.includes('coast') || region?.tags.includes('island')
    if (!coast && race?.id !== 'fish') return false
  }
  return true
}

export function jobRate(st: GameState, job: JobDef): number {
  let rate = job.rate
  if (job.id === 'gather') rate *= raceMult(st, 'gather') * (st.techs.agri1 ? 1.25 : 1)
  if (job.id === 'fisher') rate *= raceMult(st, 'fish') * regionMult(st, 'fish') * (st.techs.agri1 ? 1.1 : 1)
  if (job.id === 'research') rate *= raceMult(st, 'research')
  if (job.id === 'wood' || job.id === 'stone' || job.id === 'clay') rate *= regionMult(st, job.res)
  return rate
}

export function foodBurn(st: GameState): number {
  return st.pop * EAT_RATE * (st.techs.fire3 ? 0.8 : 1)
}

/** 工序速度总倍率（种族建造 + 区域 planning + 夏季） */
export function craftSpeed(st: GameState, season: Season): number {
  return raceMult(st, 'build') * regionMult(st, 'craft') * SEASON_MODS[season].build
}

// ── 技术研究 ─────────────────────────────────────────────────
export function canResearch(st: GameState, tech: Tech): { ok: boolean; reason: string } {
  if (st.techs[tech.id]) return { ok: false, reason: '已研究' }
  if ((st.res.insight ?? 0) < tech.cost) return { ok: false, reason: `见识不足（${tech.cost}）` }
  for (const r of tech.req) {
    if (!st.techs[r]) return { ok: false, reason: `需要前置：${TECH_MAP.get(r)?.name ?? r}` }
  }
  return { ok: true, reason: '' }
}

export function research(st: GameState, techId: string, silent = false): void {
  const tech = TECH_MAP.get(techId)
  if (!tech || st.techs[techId]) return
  const chk = canResearch(st, tech)
  if (!chk.ok && !silent) { pushLog(st, 'bad', `无法研究「${tech.name}」：${chk.reason}`); return }
  if (chk.ok) st.res.insight -= tech.cost
  st.techs[techId] = true
  if (tech.card) {
    st.cards.push(techId)
    if (!silent) pushLog(st, 'good', `新见解：「${tech.name}」——${tech.desc}`)
  }
  if (techId === 'metal1') {
    // 青铜之门：解锁远征（去有矿的地方）
    pushLog(st, 'good', '族人们画下了远方山地的地图——现在可以派出远征队了。')
    st.flags.expeditionUnlocked = true
  }
  if (techId === 'metal1') checkFreeUnlocks(st)
  emit({ type: 'researched', techId })
}

/** 通关基础内容（青铜之门研究）→ 解锁自由迁区与全部远征目标 */
export function checkFreeUnlocks(st: GameState): void {
  if (!st.freeUnlocks && st.techs.metal1) {
    st.freeUnlocks = true
    pushLog(st, 'good', '文明的火种已立住。世界地图上更远的土地，已进入远征与迁徙的视野。')
  }
}

// ── 建造 ─────────────────────────────────────────────────────
export function canBuild(st: GameState, id: string): { ok: boolean; reason: string } {
  const b = BUILDING_MAP.get(id)
  if (!b) return { ok: false, reason: '未知建筑' }
  if (b.techReq && !st.techs[b.techReq]) return { ok: false, reason: '技术未解锁' }
  // 拟真因果链：泥壳窑必须由一次失败的露天烧陶解锁（温度不足 → 见识 → 建窑）
  if (b.id === 'kiln' && !st.flags.potteryFail) {
    return { ok: false, reason: '需先经历一次露天烧陶的失败（温度不足）' }
  }
  for (const c of b.cost) {
    if ((st.res[c.res] ?? 0) < c.qty) return { ok: false, reason: `${c.res} 不足` }
  }
  return { ok: true, reason: '' }
}

export function build(st: GameState, id: string): void {
  const b = BUILDING_MAP.get(id)
  if (!b) return
  const chk = canBuild(st, id)
  if (!chk.ok) { pushLog(st, 'bad', `无法建造「${b.name}」：${chk.reason}`); return }
  for (const c of b.cost) st.res[c.res] -= c.qty
  st.buildings[id] = (st.buildings[id] ?? 0) + 1
  pushLog(st, 'good', `建好了：${b.name}。${b.desc}`)
  emit({ type: 'built', buildingId: id })
}

// ── 配方与试错 ───────────────────────────────────────────────
function effectiveMaterials(st: GameState, recipeId: string, altUsed: boolean): { res: string; qty: number }[] {
  const r = RECIPE_MAP.get(recipeId)
  if (!r) return []
  const mats = r.materials.map(m => {
    // 勒瓦娄哇技术：石料减半
    if (m.res === 'stone' && st.techs.knapping3) return { res: m.res, qty: Math.ceil(m.qty / 2) }
    return { ...m }
  })
  if (altUsed && r.altMaterial) {
    const alt = r.altMaterial
    const qty = st.techs.knapping3 ? Math.ceil(alt.qty / 2) : alt.qty
    return [{ res: alt.res, qty }, ...mats.filter(m => m.res !== alt.res)]
  }
  return mats
}

export function canStartRecipe(st: GameState, recipeId: string, altUsed = false): { ok: boolean; reason: string } {
  const r = RECIPE_MAP.get(recipeId)
  if (!r) return { ok: false, reason: '未知配方' }
  if (r.techReq && !st.techs[r.techReq]) return { ok: false, reason: '技术未解锁' }
  if (r.facilityReq && (st.buildings[r.facilityReq] ?? 0) < 1) {
    return { ok: false, reason: `需要设施：${BUILDING_MAP.get(r.facilityReq)?.name ?? r.facilityReq}` }
  }
  if (st.queue.length >= 3) return { ok: false, reason: '工坊队列已满' }
  for (const m of effectiveMaterials(st, recipeId, altUsed)) {
    if ((st.res[m.res] ?? 0) < m.qty) return { ok: false, reason: `${m.res} 不足` }
  }
  return { ok: true, reason: '' }
}

export function startRecipe(st: GameState, recipeId: string, altUsed = false): void {
  const r = RECIPE_MAP.get(recipeId)
  if (!r) return
  const chk = canStartRecipe(st, recipeId, altUsed)
  if (!chk.ok) { pushLog(st, 'bad', `无法开工「${r.name}」：${chk.reason}`); return }
  for (const m of effectiveMaterials(st, recipeId, altUsed)) st.res[m.res] -= m.qty
  st.queue.push({ kind: 'recipe', id: recipeId, stepIdx: 0, stepT: 0, altUsed })
  if (recipeId === 'potteryFiring' && !st.flags.firingAttempted) st.flags.firingAttempted = true
  pushLog(st, '', `开工：${r.name}${altUsed && r.altMaterial ? '（用普通石料替代燧石，品质较低）' : ''}`)
}

export function canStartTrial(st: GameState, trialId: string): { ok: boolean; reason: string } {
  const t = TRIAL_MAP.get(trialId)
  if (!t) return { ok: false, reason: '未知活动' }
  if (t.techReq && !st.techs[t.techReq]) return { ok: false, reason: '技术未解锁' }
  if (st.flags[t.successFlag]) return { ok: false, reason: '已完成' }
  if (st.queue.length >= 3) return { ok: false, reason: '工坊队列已满' }
  for (const c of t.cost) {
    if ((st.res[c.res] ?? 0) < c.qty) return { ok: false, reason: `${c.res} 不足` }
  }
  return { ok: true, reason: '' }
}

export function startTrial(st: GameState, trialId: string): void {
  const t = TRIAL_MAP.get(trialId)
  if (!t) return
  const chk = canStartTrial(st, trialId)
  if (!chk.ok) { pushLog(st, 'bad', `无法进行「${t.name}」：${chk.reason}`); return }
  for (const c of t.cost) st.res[c.res] -= c.qty
  st.queue.push({ kind: 'trial', id: trialId, stepIdx: 0, stepT: 0 })
  pushLog(st, '', `开始尝试：${t.name}。`)
}

export function admitPop(st: GameState): void {
  if (st.pop >= popCap(st)) { pushLog(st, 'bad', '住不下更多族人了，先盖棚屋。'); return }
  const cost = admitCost(st)
  if ((st.res.food ?? 0) < cost) { pushLog(st, 'bad', `接纳族人需要 ${cost} 食物。`); return }
  st.res.food -= cost
  st.pop += 1
  pushLog(st, 'good', '一位新族人加入了营地。')
  emit({ type: 'admitted', pop: st.pop })
}

export function assignJob(st: GameState, jobId: string, delta: number): void {
  const cur = st.jobs[jobId] ?? 0
  const used = Object.values(st.jobs).reduce((a, b) => a + b, 0)
  const next = cur + delta
  if (next < 0) return
  if (delta > 0 && used >= st.pop) return
  st.jobs[jobId] = next
}

// ── 远征 ─────────────────────────────────────────────────────
export const EXPEDITION_BASE_SECS = 120

export function expeditionTime(st: GameState, targetId: string): number {
  const race = raceOf(st)
  const scout = raceMult(st, 'scout')
  let t = EXPEDITION_BASE_SECS / scout
  if (targetId === 'altai' && race?.id === 'hawk') t *= 0.7
  if (targetId === 'sea_isles' && race?.id === 'fish') t *= 0.7
  return Math.round(t)
}

export function canStartExpedition(st: GameState, targetId: string): { ok: boolean; reason: string } {
  if (!st.flags.expeditionUnlocked) return { ok: false, reason: '尚未掌握远方的知识（先研究「窑边的绿石头」）' }
  if (st.expedition) return { ok: false, reason: '远征队还在路上' }
  if ((st.res.food ?? 0) < 20) return { ok: false, reason: '远征需要 20 食物做行粮' }
  if (!REGION_MAP.get(targetId)) return { ok: false, reason: '未知目标' }
  return { ok: true, reason: '' }
}

export function startExpedition(st: GameState, targetId: string): void {
  const chk = canStartExpedition(st, targetId)
  if (!chk.ok) { pushLog(st, 'bad', `无法远征：${chk.reason}`); return }
  st.res.food -= 20
  st.expedition = { target: targetId, left: expeditionTime(st, targetId) }
  pushLog(st, '', `远征队出发，前往${REGION_MAP.get(targetId)?.name}。`)
}

function completeExpedition(st: GameState, rand: () => number): void {
  const target = REGION_MAP.get(st.expedition!.target)
  st.expedition = null
  if (!target) return
  // 收益：50% 概率直取区域特产（abundance 最高），其余按 abundance 权重
  const loot: Record<string, number> = {}
  const pick = (res: string) => { loot[res] = (loot[res] ?? 0) + 4 + Math.floor(rand() * 4) }
  const top = [...target.resources].sort((a, b) => b.abundance - a.abundance)
  const rolls = 3
  for (let i = 0; i < rolls; i++) {
    if (i === 0 && top.length > 0 && rand() < 0.5) { pick(top[0].res); continue }
    const weighted = top.filter(r => BASE_CAPS[r.res] !== 0)
    const total = weighted.reduce((a, b) => a + b.abundance, 0)
    let x = rand() * total
    for (const it of weighted) {
      x -= it.abundance
      if (x <= 0) { pick(it.res); break }
    }
  }
  const parts: string[] = []
  for (const [res, qty] of Object.entries(loot)) {
    const cap = resCap(st, res)
    const made = cap === 0 ? qty : Math.min(qty, cap - (st.res[res] ?? 0))
    st.res[res] = (st.res[res] ?? 0) + made
    parts.push(`${RES_MAP.get(res)?.name ?? res}×${made}`)
  }
  const ins = 3 + Math.floor(rand() * 6)
  st.res.insight += ins
  pushLog(st, 'good', `远征队归来：${parts.join('、')}（见识 +${ins}）`)
}

// ── 神迹（消耗信仰）─────────────────────────────────────────
export interface Miracle { id: string; name: string; cost: number; desc: string }

export const MIRACLES: Miracle[] = [
  { id: 'harvest', name: '丰收神迹', cost: 30, desc: '立即获得食物（上限的 30%）。' },
  { id: 'inspire', name: '启迪神迹', cost: 45, desc: '立即获得 40 点见识。' },
  { id: 'bless', name: '庇佑神迹', cost: 25, desc: '下一次有失败率的工序必定成功。' },
]

export function canMiracle(st: GameState, id: string): { ok: boolean; reason: string } {
  const m = MIRACLES.find(x => x.id === id)
  if (!m) return { ok: false, reason: '未知神迹' }
  if ((st.res.faith ?? 0) < m.cost) return { ok: false, reason: `信仰不足（${m.cost}）` }
  return { ok: true, reason: '' }
}

export function doMiracle(st: GameState, id: string): void {
  const m = MIRACLES.find(x => x.id === id)
  if (!m) return
  const chk = canMiracle(st, id)
  if (!chk.ok) { pushLog(st, 'bad', `神迹未降临：${chk.reason}`); return }
  st.res.faith -= m.cost
  if (id === 'harvest') {
    const cap = resCap(st, 'food')
    const give = Math.min(cap - st.res.food, Math.floor(cap * 0.3))
    st.res.food += give
    pushLog(st, 'good', `天降丰收：食物 +${give}。`)
  } else if (id === 'inspire') {
    st.res.insight += 40
    pushLog(st, 'good', '神启如电光入梦：见识 +40。')
  } else if (id === 'bless') {
    st.flags.blessed = true
    pushLog(st, 'good', '庇佑已降：下一次有风险的工序必定成功。')
  }
}

// ── 随机事件 ─────────────────────────────────────────────────
function rollEvent(st: GameState, season: Season, rand: () => number): void {
  if (st.time - (st.lastEventT ?? 0) < 120) return
  st.lastEventT = st.time
  if (rand() >= 0.25) return
  const pool: { id: string; w: number; run: () => void }[] = [
    { id: 'good_harvest', w: season === 'autumn' ? 2 : 1, run: () => { st.res.food = Math.min(resCap(st, 'food'), st.res.food + 30); pushLog(st, 'good', '发现了一片硕果累累的林子，粮袋都装满了。') } },
    { id: 'beast', w: season === 'winter' ? 2 : 1, run: () => { st.res.food = Math.max(0, st.res.food * 0.75); pushLog(st, 'bad', '狼群夜袭了储粮堆，损失了一些食物。') } },
    { id: 'wanderers', w: 1, run: () => { if (st.pop < popCap(st)) { st.pop += 1; pushLog(st, 'good', '一小队流浪者请求加入，营地多了一位族人。') } } },
    { id: 'strange_tales', w: 1, run: () => { st.res.insight += 5; pushLog(st, '', '旅人讲起远方的故事：山那边的部落会「把石头烧成水」。（见识 +5）') } },
    { id: 'omen', w: 1, run: () => { st.res.faith += 5; pushLog(st, '', '族人仰望星空良久，对神明的敬畏更深了。（信仰 +5）') } },
  ]
  const total = pool.reduce((a, b) => a + b.w, 0)
  let x = rand() * total
  for (const e of pool) {
    x -= e.w
    if (x <= 0) { e.run(); return }
  }
}

// ── 主循环 ───────────────────────────────────────────────────
export function tick(st: GameState, dt: number, rand: () => number = Math.random): void {
  st.time += dt
  const season = seasonOfNow(st)
  const prevSeason = st.season
  if (prevSeason && prevSeason !== season) {
    emit({ type: 'seasonChanged', season })
    pushLog(st, '', `季节更替：${SEASON_MODS[season].label}。${SEASON_MODS[season].desc}`)
  }
  st.season = season

  // 职业产出 + 工具消耗（季节/种族/区域倍率）
  for (const job of JOBS) {
    const n = st.jobs[job.id] ?? 0
    if (n <= 0) continue
    let mult = 1
    if (job.tool) {
      const tb = toolBoost(st, job.tool)
      mult = tb.mult
      if (tb.tool) {
        const dur = TOOL_DUR[tb.tool] ?? 300
        const durMult = st.techs.knapping4 ? 1.5 : 1
        st.toolUse[tb.tool] = (st.toolUse[tb.tool] ?? 0) + n * dt
        while (st.toolUse[tb.tool] >= dur * durMult) {
          st.toolUse[tb.tool] -= dur * durMult
          st.res[tb.tool] = Math.max(0, (st.res[tb.tool] ?? 0) - 1)
          pushLog(st, 'bad', `一把${TOOL_NAMES[tb.tool]}用坏了。`)
        }
      }
    }
    const seasonKey = job.res === 'food' || job.res === 'wood' || job.res === 'stone' || job.res === 'clay' || job.res === 'flint' ? 'gather' : ''
    const sm = seasonKey ? SEASON_MODS[season][seasonKey as 'gather'] : 1
    const gain = n * jobRate(st, job) * mult * sm * dt
    const cap = resCap(st, job.res)
    if (cap === 0) st.res[job.res] = (st.res[job.res] ?? 0) + gain
    else st.res[job.res] = Math.min(cap, (st.res[job.res] ?? 0) + gain)
  }

  // 小田被动产出（种族农耕 + 秋季）
  const fields = st.buildings.field ?? 0
  if (fields > 0) {
    const cap = resCap(st, 'food')
    st.res.food = Math.min(cap, st.res.food + 0.25 * fields * raceMult(st, 'farm') * SEASON_MODS[season].gather * dt)
  }

  // 进食（季节消耗）
  st.res.food = Math.max(0, st.res.food - foodBurn(st) * SEASON_MODS[season].food * dt)

  // 信仰积累：人口 × 基础 + 祭坛
  st.res.faith = Math.min(resCap(st, 'faith'), (st.res.faith ?? 0) + (BASE_FAITH_RATE * st.pop + (st.buildings.shrine ?? 0) * 0.06) * dt)

  // 一次性观察事件
  for (const ev of OBSERVE_EVENTS) {
    if (!st.flags[ev.flag] && (st.res[ev.res] ?? 0) > 0) {
      st.flags[ev.flag] = true
      st.res.insight += ev.insight
      pushLog(st, 'good', ev.text + `（见识 +${ev.insight}）`)
    }
  }

  // 随机事件
  rollEvent(st, season, rand)

  // 远征推进
  if (st.expedition) {
    st.expedition.left -= dt
    if (st.expedition.left <= 0) completeExpedition(st, rand)
  }

  // 工坊队列
  const head = st.queue[0]
  if (head) {
    const speed = head.kind === 'recipe' ? craftSpeed(st, season) : 1
    if (head.kind === 'recipe') {
      const r = RECIPE_MAP.get(head.id)
      if (r) {
        const step = r.steps[head.stepIdx]
        head.stepT += dt * speed
        if (head.stepT >= step.secs) {
          if (step.failure) {
            let failP = step.failure.base
            // 设施加成：配方指定设施（如锻炉）时按设施判定，否则按泥壳窑（陶器线）
            const hasFacility = r.facilityReq ? (st.buildings[r.facilityReq] ?? 0) > 0 : (st.buildings.kiln ?? 0) > 0
            if (hasFacility) failP += step.failure.kiln ?? 0
            if (st.techs.pottery3) failP -= 0.05
            const blessed = st.flags.blessed === true
            if (blessed) failP = 0
            if (rand() < failP) {
              st.res.insight += step.failure.insightOnFail
              pushLog(st, 'bad', `${step.name}失败！${step.failure.failMsg}（见识 +${step.failure.insightOnFail}）`)
              if (!hasFacility && step.failure.hintIfNoKiln) pushLog(st, '', step.failure.hintIfNoKiln)
              if (!hasFacility && !r.facilityReq && !st.flags.potteryFail) {
                st.flags.potteryFail = true
                pushLog(st, '', '族人们决定用泥壳把窑室围起来，建成一座真正的窑。（解锁「泥壳窑」）')
              }
              emit({ type: 'craftFailed', recipeId: head.id, stepName: step.name, insight: step.failure.insightOnFail })
              st.queue.shift()
              return
            }
            if (blessed) {
              st.flags.blessed = false
              pushLog(st, 'good', '神明庇佑：本应失败的工序奇迹般地完成了。')
            }
          }
          head.stepIdx += 1
          head.stepT = 0
          if (head.stepIdx >= r.steps.length) {
            const out = r.output
            const cap = resCap(st, out.res)
            const made = cap === 0 ? out.qty : Math.min(out.qty, cap - st.res[out.res])
            st.res[out.res] = (st.res[out.res] ?? 0) + made
            const outName = RES_MAP.get(out.res)?.name ?? out.res
            pushLog(st, 'good', `完成了：${r.name}，产出 ${outName}×${made}。`)
            emit({ type: 'crafted', recipeId: r.id, outputRes: out.res, qty: made })
            st.queue.shift()
          }
        }
      } else st.queue.shift()
    } else {
      const t = TRIAL_MAP.get(head.id)
      if (t) {
        head.stepT += dt
        if (head.stepT >= t.secs) {
          if (rand() < t.successRate) {
            st.flags[t.successFlag] = true
            st.res.insight += t.successInsight
            pushLog(st, 'good', `${t.successMsg}（见识 +${t.successInsight}）`)
          } else {
            st.res.insight += t.insightOnFail
            pushLog(st, 'bad', `${t.failMsg}（见识 +${t.insightOnFail}）`)
          }
          emit({ type: 'trialDone', trialId: t.id, success: st.flags[t.successFlag] === true })
          st.queue.shift()
        }
      } else st.queue.shift()
    }
  }

  // 惯性治理（神明放任自动发展）
  if (st.autoManage) govern(st, dt, rand, season)
}
