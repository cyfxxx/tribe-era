// headless 数值模拟：策略 AI 玩完整局，验证核心循环无死锁、时长合理、失败路径必现
import { createInitialState, tick, admitPop, assignJob, build, startRecipe, startTrial, research,
  canResearch, canBuild, canStartRecipe, canStartTrial, popCap, resCap, foodBurn, admitCost,
  startExpedition, canStartExpedition, type GameState } from '../src/sim'
import { TECHS, TECH_MAP } from '../src/data/techs'
import { BUILDINGS } from '../src/data/buildings'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TECH_ORDER = ['fire1', 'knapping1', 'agri1', 'fire2', 'fire3', 'knapping2', 'agri2', 'fire4',
  'agri3', 'pottery1', 'pottery2', 'pottery3', 'agri4', 'metal1',
  'metal2', 'metal3', 'metal4', 'metal5', 'metal6']

interface Timeline { t: number; what: string }
const timeline: Timeline[] = []
let kilnBuilt = false
let furnaceBuilt = false
let openAirFailSeen = false
let openAirAttempted = false
let starvingSecs = 0
let potteryMade = 0

function wantJob(st: GameState, id: string): number {
  const pop = st.pop
  const has = (t: string) => st.techs[t]
  switch (id) {
    case 'gather': {
      const need = st.res.food < 50 ? 0.4 : 0.25
      return Math.max(1, Math.round(pop * need))
    }
    case 'wood': return has('knapping1') ? Math.max(1, Math.round(pop * 0.2)) : 0
    case 'stone': return has('knapping1') && pop >= 5 ? 1 : (pop >= 6 && has('pottery1') ? 2 : 0)
    case 'clay': return has('fire4') && !kilnBuilt ? 1 : (has('pottery2') && kilnBuilt && st.res.clay < 8 ? 1 : 0)
    case 'research': return has('pottery2') ? Math.max(1, Math.round(pop / 4)) : Math.max(2, Math.round(pop / 3))
    default: return 0
  }
}

function rebalance(st: GameState): void {
  // 顺序：研究保底 → 采集保底 → 生产 → 剩余给采集（防研究停摆死锁）
  const order = ['research', 'gather', 'wood', 'stone', 'clay']
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
  if (st.pop >= popCap(st) - 1) { if (canBuild(st, 'hut').ok) { build(st, 'hut'); timeline.push({ t: st.time, what: `建棚屋(人口${st.pop})` }) } }
  if (st.techs.metal4 && !furnaceBuilt && canBuild(st, 'furnace').ok) {
    build(st, 'furnace'); furnaceBuilt = true; timeline.push({ t: st.time, what: '建锻炉' })
  }
  if (st.techs.pottery1 && !kilnBuilt && st.flags.potteryFail && canBuild(st, 'kiln').ok) {
    build(st, 'kiln'); kilnBuilt = true; timeline.push({ t: st.time, what: '建泥壳窑(失败经验解锁)' })
  }
  if (st.techs.agri3 && (st.buildings.cellar ?? 0) < 1 && canBuild(st, 'cellar').ok) {
    build(st, 'cellar'); timeline.push({ t: st.time, what: '建地窖' })
  }
  if (st.techs.agri4 && (st.buildings.field ?? 0) < 2 && canBuild(st, 'field').ok) build(st, 'field')
}

function doExpeditions(st: GameState, rand: () => number): void {
  if (!st.flags.expeditionUnlocked || st.expedition) return
  if (rand() > 0.4) return
  const target = st.res.copperOre < 6 || (st.techs.metal5 && (st.res.tinOre ?? 0) < 5) ? 'anatolia' : 'europe_flint'
  if (canStartExpedition(st, target).ok) {
    startExpedition(st, target)
    if (!expeditionLogged) { timeline.push({ t: st.time, what: `远征 → ${target}` }); expeditionLogged = true }
  }
}
let expeditionLogged = false

function doRecipes(st: GameState, rand: () => number): void {
  doExpeditions(st, rand)
  // 砍砸器：保证至少 1 把
  if ((st.res.crudeAxe ?? 0) < 1 && canStartRecipe(st, 'crudeAxe').ok && st.jobs.wood > 0) startRecipe(st, 'crudeAxe')
  // 手斧：燧石够就造
  if (st.techs.knapping2 && (st.res.handAxe ?? 0) < 1 && st.res.flint >= 3 && canStartRecipe(st, 'handAxe').ok) {
    startRecipe(st, 'handAxe'); timeline.push({ t: st.time, what: '开工手斧(燧石)' })
  }
  // 试错：钻木取火
  if (st.techs.fire2 && !st.flags.trial_fireDrill && st.queue.length < 2 && canStartTrial(st, 'fireDrill').ok) {
    startTrial(st, 'fireDrill')
  }
  // 烧陶：pottery2 解锁后。第一次刻意在无窑时烧（复现真实玩家路径：先失败→见提示→建窑）
  if (st.techs.metal4 && furnaceBuilt && st.queue.length < 2 && canStartRecipe(st, 'smeltCopper').ok) startRecipe(st, 'smeltCopper')
  if (st.techs.metal5 && furnaceBuilt && st.queue.length < 2 && canStartRecipe(st, 'smeltBronze').ok) startRecipe(st, 'smeltBronze')
  if (st.techs.metal6 && (st.res.bronzeAxe ?? 0) < 1 && (st.res.bronze ?? 0) >= 3 && canStartRecipe(st, 'bronzeAxe').ok) startRecipe(st, 'bronzeAxe')
  if (st.techs.pottery2 && st.queue.length < 2 && canStartRecipe(st, 'potteryFiring').ok) {
    if (!openAirAttempted) {
      openAirAttempted = true
      startRecipe(st, 'potteryFiring')
      timeline.push({ t: st.time, what: '首次露天烧陶(无窑)' })
    } else if (kilnBuilt) {
      startRecipe(st, 'potteryFiring')
    }
  }
}

function doResearch(st: GameState): void {
  for (const id of TECH_ORDER) {
    if (st.techs[id]) continue
    const tech = TECH_MAP.get(id)!
    if (canResearch(st, tech).ok) {
      const before = st.res.insight
      research(st, id)
      if (st.techs[id]) timeline.push({ t: st.time, what: `研究 ${tech.name}（余识 ${Math.floor(before - tech.cost)}）` })
      break // 一tick只研一个
    }
    break // 队首未解锁就等待
  }
}

function runSim(seed: number, maxSecs: number): { win: boolean; state: GameState } {
  const st = createInitialState()
  const rand = mulberry32(seed)
  let lastDecision = -10
  for (let t = 0; t < maxSecs; t++) {
    tick(st, 1, rand)
    if (st.res.food <= 0 && st.res.food + foodBurn(st) <= 0.01) starvingSecs++
    else starvingSecs = 0
    if (st.time - lastDecision >= 5) {
      lastDecision = st.time
      rebalance(st)
      // 添丁：接近食物上限且住得下时（一次性，避免刷屏）
      const fcap = resCap(st, 'food')
      if (st.res.food > fcap - 15 && st.pop < popCap(st) && st.res.food >= admitCost(st)) {
        admitPop(st); timeline.push({ t: st.time, what: `添丁(${st.pop})` })
      }
      doBuilds(st)
      doRecipes(st, rand)
      doResearch(st)
    }
    const last = st.log[st.log.length - 1]
    if (st.flags.potteryFail) openAirFailSeen = true
    potteryMade = Math.max(potteryMade, st.res.pottery)
    if ((st.res.bronzeAxe ?? 0) > 0) return { win: true, state: st }
  }
  return { win: false, state: st }
}

// ── 跑 5 个种子 ───────────────────────────────────────────────
const MAX = 10800 // 3 小时游戏时间上限（青铜线全程）
const results: boolean[] = []
let allBronze = true
let failSeenCount = 0
for (const seed of [1, 7, 42, 2026, 998244353]) {
  potteryMade = 0; openAirFailSeen = false; openAirAttempted = false; kilnBuilt = false; furnaceBuilt = false; expeditionLogged = false
  timeline.length = 0
  const { win, state } = runSim(seed, MAX)
  results.push(win)
  console.log(`\n===== seed=${seed} ${win ? 'PASS' : 'FAIL'} 终局 t=${Math.floor(state.time)}s (第${Math.floor(state.time / 60)}天) =====`)
  for (const e of timeline) console.log(`  [${String(Math.floor(e.t / 60)).padStart(3, '0')}天${String(Math.floor(e.t % 60)).padStart(2, '0')}s] ${e.what}`)
  console.log(`  陶器累计=${Math.floor(state.res.pottery)} 人口=${state.pop} 食物=${Math.floor(state.res.food)} 见识余=${Math.floor(state.res.insight)} 露天烧陶失败=${openAirFailSeen ? '是' : '否'}`)
  if (openAirFailSeen) failSeenCount++
  if ((state.res.bronzeAxe ?? 0) <= 0) allBronze = false
  console.log(`  铜=${Math.floor(state.res.copper ?? 0)} 青铜=${Math.floor(state.res.bronze ?? 0)} 青铜斧=${state.res.bronzeAxe ?? 0}`)
  if (seed === 42) {
    console.log('  --- 日志尾部(检验提示文案) ---')
    for (const l of state.log.slice(-12)) console.log(`  · ${l.text}`)
  }
}

// ── 断言 ─────────────────────────────────────────────────────
console.log('\n===== 断言 =====')
const allWin = results.every(Boolean)
const failCount = failSeenCount
console.log(`${allWin ? 'PASS' : 'FAIL'} 全部种子 ${MAX}s 内通关（铸出青铜斧）`)
console.log(`${allBronze ? 'PASS' : 'FAIL'} 青铜有产出（bronze>0）`)
console.log(`${failCount >= 3 ? 'PASS' : 'FAIL'} 露天烧陶失败路径在 ${failCount}/5 种子中出现（60%失败率下 ≥3 即验证提示链路）`)
console.log(`${potteryMade > 0 ? 'PASS' : 'FAIL'} 陶器有产出（pottery>0）`)
process.exit(allWin && failCount >= 3 && allBronze ? 0 : 1)
