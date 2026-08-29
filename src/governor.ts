// 惯性发展治理 AI：神明放任时文明自行运转的策略核心
// 与 tools/simulate.ts 的数值模拟策略同源——模拟即测试 AI
import {
  type GameState, assignJob, admitPop, build, startRecipe, startTrial, research,
  canResearch, canBuild, canStartRecipe, canStartTrial, popCap, resCap, admitCost,
  startExpedition, canStartExpedition, pushLog,
} from './sim'
import { TECH_MAP } from './data/techs'
import { REGION_MAP } from './core/world'
import { raceOf } from './sim'

const TECH_ORDER = ['fire1', 'knapping1', 'agri1', 'fire2', 'fire3', 'knapping2', 'agri2', 'fire4',
  'agri3', 'pottery1', 'pottery2', 'pottery3', 'agri4', 'metal1',
  'metal2', 'metal3', 'metal4', 'metal5', 'metal6']

const RACE_AI: Record<string, { research: number; gather: number; build: number; grow: number; scout: number }> = {
  fox:  { research: 1.3, gather: 1.0, build: 1.0, grow: 1.0, scout: 1.0 },
  cat:  { research: 1.0, gather: 1.25, build: 1.0, grow: 1.0, scout: 1.1 },
  dog:  { research: 1.0, gather: 1.0, build: 1.1, grow: 1.25, scout: 1.0 },
  ox:   { research: 0.8, gather: 1.0, build: 1.3, grow: 1.0, scout: 0.9 },
  hawk: { research: 1.1, gather: 1.0, build: 1.0, grow: 1.0, scout: 1.5 },
  fish: { research: 1.0, gather: 1.1, build: 1.0, grow: 1.0, scout: 1.2 },
}

function aiWeights(st: GameState) {
  const race = raceOf(st)
  return RACE_AI[race?.id ?? 'fox'] ?? RACE_AI.fox
}

function wantJob(st: GameState, id: string): number {
  const pop = st.pop
  const w = aiWeights(st)
  const has = (t: string) => st.techs[t]
  const coast = (() => { const r = st.regionId ? REGION_MAP.get(st.regionId) : undefined; return r?.tags.includes('coast') || r?.tags.includes('island') })()
  switch (id) {
    case 'gather': {
      const base = st.res.food < 50 ? 0.4 : 0.25
      return Math.max(1, Math.round(pop * base * w.gather))
    }
    case 'fisher': return coast ? 1 : 0
    case 'wood': return has('knapping1') ? Math.max(1, Math.round(pop * 0.2)) : 0
    case 'stone': {
      const wantKiln = has('pottery1') && !st.flags.potteryFail
      const wantMetal = has('metal4')
      return has('knapping1') && pop >= 5 ? (wantKiln || wantMetal ? 2 : 1) : 0
    }
    case 'clay': return has('fire4') && (st.buildings.kiln ?? 0) < 1 ? 1 : (has('pottery2') && st.res.clay < 8 ? 1 : 0)
    case 'research': return Math.max(1, Math.round((pop / 3) * w.research))
    default: return 0
  }
}

function rebalance(st: GameState): void {
  const order = ['research', 'gather', 'fisher', 'wood', 'stone', 'clay']
  const targets = new Map<string, number>()
  let budget = st.pop
  for (const j of order) {
    const want = Math.min(budget, wantJob(st, j))
    targets.set(j, want)
    budget -= want
  }
  if (budget > 0) targets.set('gather', (targets.get('gather') ?? 0) + budget)
  for (const [j, want] of targets) {
    const cur = st.jobs[j] ?? 0
    if (cur < want) for (let i = 0; i < want - cur; i++) assignJob(st, j, 1)
    else if (cur > want) for (let i = 0; i < cur - want; i++) assignJob(st, j, -1)
  }
}

function doBuilds(st: GameState): void {
  const w = aiWeights(st)
  const wantHut = st.pop >= popCap(st) - 1 || w.build >= 1.3
  if (wantHut && canBuild(st, 'hut').ok) build(st, 'hut')
  if (st.techs.pottery1 && !st.flags.potteryFail && canBuild(st, 'kiln').ok) build(st, 'kiln')
  if (st.techs.agri3 && (st.buildings.cellar ?? 0) < 1 && canBuild(st, 'cellar').ok) build(st, 'cellar')
  if (st.techs.agri4 && (st.buildings.field ?? 0) < 2 && canBuild(st, 'field').ok) build(st, 'field')
  if (st.techs.metal4 && (st.buildings.furnace ?? 0) < 1 && canBuild(st, 'furnace').ok) build(st, 'furnace')
  if (st.res.faith >= 100 && (st.buildings.shrine ?? 0) < 1 && canBuild(st, 'shrine').ok) build(st, 'shrine')
}

function doExpedition(st: GameState, rand: () => number): void {
  const w = aiWeights(st)
  if (!st.flags.expeditionUnlocked || st.expedition) return
  if (rand() > 0.3 * w.scout) return
  // 有铜锡需求的优先矿点；否则选资源互补区
  const wantCopper = st.techs.metal1 && (st.res.copperOre ?? 0) < 6
  const targets = wantCopper
    ? ['anatolia', 'australia_west', 'nile']
    : ['europe_flint', 'nile', 'sea_isles']
  for (const t of targets) {
    if (canStartExpedition(st, t).ok) { startExpedition(st, t); return }
  }
}

function doRecipes(st: GameState, rand: () => number): void {
  void rand
  if ((st.res.crudeAxe ?? 0) < 1 && (st.jobs.wood ?? 0) > 0 && canStartRecipe(st, 'crudeAxe').ok) startRecipe(st, 'crudeAxe')
  if (st.techs.knapping2 && (st.res.handAxe ?? 0) < 1 && (st.res.flint ?? 0) >= 3 && canStartRecipe(st, 'handAxe').ok) startRecipe(st, 'handAxe')
  if (st.techs.knapping4 && (st.res.digStick ?? 0) < 1 && canStartRecipe(st, 'digStick').ok) startRecipe(st, 'digStick')
  if (st.techs.fire2 && !st.flags.trial_fireDrill && st.queue.length < 2 && canStartTrial(st, 'fireDrill').ok) startTrial(st, 'fireDrill')
  if (st.techs.pottery2 && st.queue.length < 2 && canStartRecipe(st, 'potteryFiring').ok) startRecipe(st, 'potteryFiring')
  if (st.techs.metal4 && st.queue.length < 2 && canStartRecipe(st, 'smeltCopper').ok) startRecipe(st, 'smeltCopper')
  if (st.techs.metal5 && st.queue.length < 2 && canStartRecipe(st, 'smeltBronze').ok) startRecipe(st, 'smeltBronze')
  if (st.techs.metal6 && (st.res.bronzeAxe ?? 0) < 1 && (st.res.bronze ?? 0) >= 3 && canStartRecipe(st, 'bronzeAxe').ok) startRecipe(st, 'bronzeAxe')
}

function doResearch(st: GameState): void {
  for (const id of TECH_ORDER) {
    if (st.techs[id]) continue
    const tech = TECH_MAP.get(id)!
    if (canResearch(st, tech).ok) { research(st, id); break }
    break
  }
}

let lastDecision = -10

/** 治理心跳：由 sim.tick 在 autoManage 开启时调用 */
export function govern(st: GameState, dt: number, rand: () => number, _season: string): void {
  void _season
  // 神明放任时的添丁阈值更宽松（族群自发繁衍）
  const w = aiWeights(st)
  const fcap = resCap(st, 'food')
  if (st.res.food > fcap - 15 && st.pop < popCap(st) && st.res.food >= admitCost(st) * (2 - w.grow * 0.5)) admitPop(st)
  if (st.time - lastDecision >= 5) {
    lastDecision = st.time
    rebalance(st)
    doBuilds(st)
    doExpedition(st, rand)
    doRecipes(st, rand)
    doResearch(st)
  }
  void pushLog
}
