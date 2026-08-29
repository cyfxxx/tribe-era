// 模拟核心：与 DOM 完全解耦（headless 模拟器直接 import 本文件）
import { BASE_CAPS, RES_MAP } from './data/resources'
import { TECH_MAP, OBSERVE_EVENTS, type Tech } from './data/techs'
import { BUILDING_MAP } from './data/buildings'
import { RECIPE_MAP, TRIAL_MAP } from './data/recipes'

export interface LogEntry { t: number; cls: '' | 'bad' | 'good'; text: string }

export interface QueueItem {
  kind: 'recipe' | 'trial'
  id: string
  stepIdx: number
  stepT: number
  /** 配方使用替代材料 */
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
  /** 工具耐久累积器：toolId -> 已产出秒数 */
  toolUse: Record<string, number>
  flags: Record<string, boolean>
  cards: string[]
  log: LogEntry[]
}

// ── 职业 ─────────────────────────────────────────────────────
export interface JobDef {
  id: string
  name: string
  res: string
  rate: number
  techReq?: string
  /** 作业使用的工具（取库存中 boost 最高的） */
  tool?: string[]
}

export const JOBS: JobDef[] = [
  { id: 'gather',   name: '采集',  res: 'food',    rate: 0.5 },
  { id: 'wood',     name: '伐木',  res: 'wood',    rate: 0.35, tool: ['handAxe', 'crudeAxe'] },
  { id: 'stone',    name: '采石',  res: 'stone',   rate: 0.22 },
  { id: 'clay',     name: '挖粘土', res: 'clay',   rate: 0.25, techReq: 'fire4', tool: ['digStick'] },
  { id: 'research', name: '研究',  res: 'insight', rate: 0.1 },
]
export const JOB_MAP = new Map(JOBS.map(j => [j.id, j]))

const EAT_RATE = 0.12
const POP_BASE_CAP = 4

/** 接纳族人的动态成本：人口越多摩擦越大（防指数滚雪球） */
export function admitCost(st: GameState): number {
  return 50 + 12 * Math.max(0, st.pop - 3)
}

// ── 初始状态 ─────────────────────────────────────────────────
export function createInitialState(): GameState {
  const st: GameState = {
    version: 1,
    time: 0,
    res: { food: 20, wood: 10, stone: 5, flint: 0, fiber: 5, clay: 0, pottery: 0, insight: 0, crudeAxe: 0, handAxe: 0, digStick: 0 },
    pop: 3,
    jobs: { gather: 3, wood: 0, stone: 0, clay: 0, research: 0 },
    techs: {},
    buildings: {},
    queue: [],
    toolUse: {},
    flags: {},
    cards: [],
    log: [],
  }
  research(st, 'fire1', true)
  pushLog(st, '', '一小群族人围着一堆篝火安顿下来。火种要一直养着。')
  return st
}

export function pushLog(st: GameState, cls: '' | 'bad' | 'good', text: string): void {
  st.log.push({ t: Math.floor(st.time), cls, text })
  if (st.log.length > 60) st.log.splice(0, st.log.length - 60)
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
  if (res === 'insight') cap = 0
  return cap
}

/** 工具倍率：库存中 boost 最高者 */
export function toolBoost(st: GameState, tools: string[]): { mult: number; tool: string | null } {
  let best = { mult: 1, tool: null as string | null }
  for (const t of tools) {
    if ((st.res[t] ?? 0) > 0) {
      const def = t
      const boost = ({ crudeAxe: 1.3, handAxe: 1.6, digStick: 1.4 } as Record<string, number>)[def] ?? 1
      if (boost > best.mult) best = { mult: boost, tool: t }
    }
  }
  return best
}

export function jobRate(st: GameState, job: JobDef): number {
  let rate = job.rate
  if (job.id === 'gather' && st.techs.agri1) rate *= 1.25
  return rate
}

export function foodBurn(st: GameState): number {
  return st.pop * EAT_RATE * (st.techs.fire3 ? 0.8 : 1)
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
}

export function assignJob(st: GameState, jobId: string, delta: number): void {
  const cur = st.jobs[jobId] ?? 0
  const used = Object.values(st.jobs).reduce((a, b) => a + b, 0)
  const next = cur + delta
  if (next < 0) return
  if (delta > 0 && used >= st.pop) return
  st.jobs[jobId] = next
}

// ── 主循环 ───────────────────────────────────────────────────
export function tick(st: GameState, dt: number, rand: () => number = Math.random): void {
  st.time += dt

  // 职业产出 + 工具消耗
  for (const job of JOBS) {
    const n = st.jobs[job.id] ?? 0
    if (n <= 0) continue
    let mult = 1
    if (job.tool) {
      const tb = toolBoost(st, job.tool)
      mult = tb.mult
      // 工具耐久：按作业人数秒数消耗
      if (tb.tool) {
        const dur = ({ crudeAxe: 300, handAxe: 480, digStick: 420 } as Record<string, number>)[tb.tool] ?? 300
        const durMult = st.techs.knapping4 ? 1.5 : 1
        st.toolUse[tb.tool] = (st.toolUse[tb.tool] ?? 0) + n * dt
        while (st.toolUse[tb.tool] >= dur * durMult) {
          st.toolUse[tb.tool] -= dur * durMult
          st.res[tb.tool] = Math.max(0, (st.res[tb.tool] ?? 0) - 1)
          pushLog(st, 'bad', `一把${({ crudeAxe: '砍砸器', handAxe: '手斧', digStick: '石铲' } as Record<string, string>)[tb.tool]}用坏了。`)
        }
      }
    }
    const gain = n * jobRate(st, job) * mult * dt
    const cap = resCap(st, job.res)
    if (cap === 0) {
      st.res[job.res] = (st.res[job.res] ?? 0) + gain
    } else {
      st.res[job.res] = Math.min(cap, (st.res[job.res] ?? 0) + gain)
    }
  }

  // 小田被动产出
  const fields = st.buildings.field ?? 0
  if (fields > 0) {
    const cap = resCap(st, 'food')
    st.res.food = Math.min(cap, st.res.food + 0.25 * fields * dt)
  }

  // 进食
  const burn = foodBurn(st) * dt
  st.res.food = Math.max(0, st.res.food - burn)

  // 一次性观察事件
  for (const ev of OBSERVE_EVENTS) {
    if (!st.flags[ev.flag] && (st.res[ev.res] ?? 0) > 0) {
      st.flags[ev.flag] = true
      st.res.insight += ev.insight
      pushLog(st, 'good', ev.text + `（见识 +${ev.insight}）`)
    }
  }

  // 工坊队列
  const head = st.queue[0]
  if (head) {
    if (head.kind === 'recipe') {
      const r = RECIPE_MAP.get(head.id)
      if (r) {
        const step = r.steps[head.stepIdx]
        head.stepT += dt
        if (head.stepT >= step.secs) {
          if (step.failure) {
            let failP = step.failure.base
            const hasKiln = (st.buildings.kiln ?? 0) > 0
            if (hasKiln) failP += step.failure.kiln ?? 0
            if (st.techs.pottery3) failP -= 0.05
            if (rand() < failP) {
              st.res.insight += step.failure.insightOnFail
              pushLog(st, 'bad', `${step.name}失败！${step.failure.failMsg}（见识 +${step.failure.insightOnFail}）`)
              if (!hasKiln && step.failure.hintIfNoKiln) pushLog(st, '', step.failure.hintIfNoKiln)
              // 失败经验解锁建窑（试错→见识→建窑 的核心拟真循环）
              if (!hasKiln) {
                if (!st.flags.potteryFail) {
                  st.flags.potteryFail = true
                  pushLog(st, '', '族人们决定用泥壳把窑室围起来，建成一座真正的窑。（解锁「泥壳窑」）')
                }
              }
              st.queue.shift()
              return
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
            st.queue.shift()
          }
        }
      } else {
        st.queue.shift()
      }
    } else {
      // trial
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
          st.queue.shift()
        }
      } else {
        st.queue.shift()
      }
    }
  }
}
