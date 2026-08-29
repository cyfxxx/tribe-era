// UI 层：状态每 500ms 全量刷新（量小无性能问题）
import {
  createInitialState, tick, pushLog, popCap, resCap, foodBurn, admitCost, raceMult, jobAvailable,
  canResearch, research, canBuild, build,
  canStartRecipe, startRecipe, canStartTrial, startTrial,
  admitPop, assignJob, JOBS, seasonOfNow, MIRACLES, canMiracle, doMiracle,
  canStartExpedition, startExpedition, type GameState,
} from './sim'
import { RES_MAP } from './data/resources'
import { TECH_MAP, LINE_NAMES, type TechLine } from './data/techs'
import type { Tech } from './data/techs'
import { all } from './core/registry'
import type { BuildingDef } from './data/buildings'
import { TRIALS, RECIPE_MAP, TRIAL_MAP } from './data/recipes'
import type { Recipe } from './data/recipes'
import { saveGame, loadGame, exportSave, importSave, clearSave } from './state'
import { validateContent } from './data'
import { RACES } from './core/races'
import { START_REGIONS, WORLD, REGION_MAP, type RegionDef } from './core/world'
import { TIME, SEASON_MODS } from './core/seasons'
import { drawWorld, hitRegion } from './ui/worldmap'
import { drawCamp } from './ui/campview'

// ── 启动校验：引用断裂立即报错 ──────────────────────────────
const report = validateContent()
if (report.errors.length > 0) {
  document.body.innerHTML = `<pre style="color:#c06453;padding:20px">内容校验失败：\n${report.errors.map(e => `${e.kind}:${e.id} — ${e.problem}`).join('\n')}</pre>`
  throw new Error('content validation failed')
}
if (report.patchErrors.length > 0) console.warn('[patches]', report.patchErrors)
if (report.patchConflicts.length > 0) console.warn('[patches] 冲突：', report.patchConflicts)

let st: GameState | null = loadGame()
if (st && (!st.raceId || !st.regionId)) st = null // 旧档无开局信息：引导重开（可先导出旧档）
const THE_ST = () => st as GameState

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T
const VERSION = 'v0.2'

// ── 弹层 ─────────────────────────────────────────────────────
function showOverlay(inner: HTMLElement): void {
  const ov = $('#overlay')
  ov.innerHTML = ''
  ov.appendChild(inner)
  ov.classList.remove('hidden')
}
function closeOverlay(): void {
  $('#overlay').classList.add('hidden')
  $('#overlay').innerHTML = ''
}
function cardBox(title: string, sub: string, textHtml: string, actions: HTMLElement[]): HTMLElement {
  const box = document.createElement('div')
  box.className = 'card-box'
  box.innerHTML = `<h3>${title}</h3><div class="card-sub">${sub}</div><div class="card-text">${textHtml}</div>`
  const act = document.createElement('div')
  act.className = 'card-actions'
  for (const a of actions) act.appendChild(a)
  box.appendChild(act)
  return box
}
function showTechCard(techId: string): void {
  const tech = TECH_MAP.get(techId)
  if (!tech?.card) return
  const btn = document.createElement('button')
  btn.className = 'primary'
  btn.textContent = '记下了'
  btn.onclick = closeOverlay
  showOverlay(cardBox(tech.card.title, `${LINE_NAMES[tech.line]} · 见识卡`, tech.card.text, [btn]))
}

// ── 开局选择（神明创造世界）─────────────────────────────────
function showSetup(): void {
  const ov = $('#overlay')
  ov.classList.remove('hidden')
  ov.innerHTML = ''
  const box = document.createElement('div')
  box.className = 'card-box setup'
  box.innerHTML = `<h3>创世 · 选择引导的种族与发源地</h3>
    <div class="card-sub">狐聪慧 · 猫灵敏 · 犬忠勇 · 牛厚重 · 鹰翱翔高山 · 鱼渊栖海岛</div>`

  let raceId: string | null = null
  let regionId: string | null = null

  const raceGrid = document.createElement('div')
  raceGrid.className = 'race-grid'
  const refreshRace = () => {
    raceGrid.innerHTML = ''
    for (const r of RACES) {
      const card = document.createElement('div')
      card.className = 'race-card' + (raceId === r.id ? ' picked' : '')
      card.innerHTML = `<b>${r.name}</b><span class="epithet">${r.epithet}</span><p>${r.traits}</p>`
      card.onclick = () => { raceId = r.id; refreshRace() }
      raceGrid.appendChild(card)
    }
  }
  refreshRace()
  box.appendChild(raceGrid)

  const hint = document.createElement('div')
  hint.className = 'card-sub'
  hint.textContent = '点击大世界地图选择发源地（金色为四大文明发源地）：'
  box.appendChild(hint)

  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 360
  canvas.className = 'world-canvas'
  box.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  const redraw = () => drawWorld(ctx, canvas.width, canvas.height, {
    selectable: START_REGIONS,
    selectedId: regionId,
  })
  redraw()
  canvas.addEventListener('click', ev => {
    const hit = hitRegion(canvas, ev, START_REGIONS)
    if (hit) { regionId = hit.id; redraw() }
  })

  const start = document.createElement('button')
  start.className = 'primary'
  start.textContent = '开始纪元'
  start.onclick = () => {
    if (!raceId || !regionId) return
    st = createInitialState(raceId, regionId)
    saveGame(st)
    renderedLog = 0
    $('#log').innerHTML = ''
    closeOverlay()
    renderAll()
  }
  box.appendChild(start)
  ov.appendChild(box)
}

// ── 资源条 ───────────────────────────────────────────────────
function renderResources(): void {
  const s = THE_ST()
  const bar = $('#resource-bar')
  bar.innerHTML = ''
  const ids = ['food', 'wood', 'stone', 'flint', 'fiber', 'clay', 'copperOre', 'tinOre', 'copper', 'bronze', 'pottery', 'insight', 'faith', 'crudeAxe', 'handAxe', 'digStick', 'bronzeAxe']
  for (const id of ids) {
    const def = RES_MAP.get(id)
    if (!def) continue
    const v = s.res[id] ?? 0
    const cap = resCap(s, id)
    const showZero = cap > 0 || v > 0
    if (!showZero) continue
    const chip = document.createElement('span')
    chip.className = 'res-chip' + (cap > 0 && v >= cap ? ' full' : '')
    const capTxt = cap > 0 ? ` / ${cap}` : ''
    chip.innerHTML = `<span class="res-name">${def.name}</span><span class="res-qty">${Math.floor(v)}${capTxt}</span>`
    bar.appendChild(chip)
  }
}

// ── 人口与职业 ───────────────────────────────────────────────
function renderPop(): void {
  const s = THE_ST()
  const used = Object.values(s.jobs).reduce((a, b) => a + b, 0)
  const race = s.raceId ? RACES.find(r => r.id === s.raceId) : undefined
  const region = s.regionId ? REGION_MAP.get(s.regionId) : undefined
  $('#pop-summary').innerHTML =
    `${race ? `<span class="race-badge">${race.name}·${race.epithet}</span>　` : ''}${region ? `<span class="region-badge">${region.name}</span>` : ''}<br>` +
    `族人 <b>${s.pop}</b> / ${popCap(s)}　已分配 <b>${used}</b><br>` +
    `进食 −${(foodBurn(s) * SEASON_MODS[seasonOfNow(s)].food).toFixed(2)}/秒`
  const jobsEl = $('#jobs')
  jobsEl.innerHTML = ''
  for (const job of JOBS) {
    if (!jobAvailable(s, job)) continue
    const row = document.createElement('div')
    row.className = 'job-row'
    const n = s.jobs[job.id] ?? 0
    row.innerHTML = `<span class="job-name">${job.name}</span>` +
      `<button data-j="${job.id}" data-d="-1" type="button">−</button>` +
      `<span class="job-num">${n}</span>` +
      `<button data-j="${job.id}" data-d="1" type="button" ${used >= s.pop ? 'disabled' : ''}>＋</button>` +
      `<span class="job-rate">${(job.rate * 60).toFixed(1)}/分</span>`
    jobsEl.appendChild(row)
  }
  jobsEl.querySelectorAll('button').forEach(b => {
    b.onclick = () => assignJob(THE_ST(), (b as HTMLElement).dataset.j!, Number((b as HTMLElement).dataset.d))
  })
  const act = $('#actions')
  act.innerHTML = ''
  const admit = document.createElement('button')
  admit.className = 'primary'
  admit.textContent = `接纳族人（食物 ${admitCost(s)}）`
  admit.onclick = () => admitPop(THE_ST())
  act.appendChild(admit)
}

// ── 神迹 ─────────────────────────────────────────────────────
function renderMiracles(): void {
  const s = THE_ST()
  const el = $('#miracles')
  el.innerHTML = ''
  for (const m of MIRACLES) {
    const row = document.createElement('div')
    row.className = 'bld-row'
    row.innerHTML =
      `<div class="r-name">${m.name} <span class="t-cost">信${m.cost}</span></div>` +
      `<div class="r-desc">${m.desc}</div>`
    const btn = document.createElement('button')
    btn.textContent = '降临'
    btn.disabled = !canMiracle(s, m.id).ok
    btn.onclick = () => { doMiracle(THE_ST(), m.id); renderMiracles() }
    row.appendChild(btn)
    el.appendChild(row)
  }
}

// ── 远征 ─────────────────────────────────────────────────────
function renderExpedition(): void {
  const s = THE_ST()
  const el = $('#expedition')
  if (!s.flags.expeditionUnlocked) { el.innerHTML = ''; return }
  el.innerHTML = '<h2 style="margin:0 0 6px">远征</h2>'
  if (s.expedition) {
    const target = REGION_MAP.get(s.expedition.target)
    el.innerHTML += `<div class="bld-row"><div class="r-name">远征队在路上</div><div class="r-desc">目的地：${target?.name ?? '?'} · 还需 ${Math.ceil(s.expedition.left)} 秒</div></div>`
    return
  }
  const row = document.createElement('div')
  row.className = 'bld-row'
  const sel = document.createElement('select')
  sel.style.cssText = 'width:100%;margin-bottom:5px'
  for (const r of WORLD.regions) {
    const opt = document.createElement('option')
    opt.value = r.id
    opt.textContent = `${r.name}${r.resources.map(x => RES_MAP.get(x.res)?.name ?? x.res).join('、')}`
    sel.appendChild(opt)
  }
  const btn = document.createElement('button')
  btn.textContent = '派出远征队（食物 20）'
  const sync = () => { btn.disabled = !canStartExpedition(s, sel.value).ok }
  sel.onchange = sync
  btn.onclick = () => { startExpedition(THE_ST(), sel.value); renderExpedition() }
  sync()
  row.appendChild(sel)
  row.appendChild(btn)
  el.appendChild(row)
}

// ── 技术树 ───────────────────────────────────────────────────
const techLineOpen: Record<string, boolean> = {}

// ── 视图切换与世界地图 ─────────────────────────────
let currentView: 'camp' | 'world' = 'camp'

function switchView(view: 'camp' | 'world'): void {
  currentView = view
  document.querySelectorAll<HTMLButtonElement>('#view-tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.view === view))
  const camp = $('#camp') as HTMLCanvasElement
  const world = $('#worldmap') as HTMLCanvasElement
  camp.hidden = view !== 'camp'
  world.hidden = view !== 'world'
  if (view === 'world') renderWorldView()
}

function renderWorldView(): void {
  const s = THE_ST()
  const ctx = ($('#worldmap') as HTMLCanvasElement).getContext('2d')!
  drawWorld(ctx, 960, 560, { currentId: s.regionId ?? null })
}

const ABUNDANCE_LABEL = ['贫瘑', '一般', '丰富', '顶级']

function showRegionInfo(region: RegionDef): void {
  const s = THE_ST()
  const box = document.createElement('div')
  box.className = 'card-box'
  const isCurrent = s.regionId === region.id
  const resList = region.resources
    .map(r => `<span class="entry"><b>${RES_MAP.get(r.res)?.name ?? r.res}</b> ${ABUNDANCE_LABEL[r.abundance] ?? r.abundance} ${'●'.repeat(r.abundance)}</span>`)
    .join('')
  const modList = region.modifiers
    .map(m => `<div class="entry"><b>${m.label}</b><p>${m.desc}</p></div>`)
    .join('')
  box.innerHTML =
    `<h3>${region.name}${isCurrent ? ' <span class="tag">✦ 当前文明所在地</span>' : ''}${region.startUnlocked ? ' <span class="tag">文明发源地</span>' : ''}</h3>` +
    `<div class="card-sub">资源分布</div><div class="card-list res-grid">${resList}</div>` +
    `<div class="card-sub">地区特色</div><div class="card-list">${modList}</div>`
  const btn = document.createElement('button')
  btn.textContent = '合上'
  btn.onclick = closeOverlay
  const act = document.createElement('div')
  act.className = 'card-actions'
  act.appendChild(btn)
  box.appendChild(act)
  showOverlay(box)
}

function renderTech(): void {
  const s = THE_ST()
  const el = $('#techtree')
  el.innerHTML = ''
  const lines: TechLine[] = ['fire', 'knapping', 'pottery', 'agri', 'metal']
  const techs = all('tech') as Tech[]
  // 默认展开：优先第一条含可研究技术的线；否则（见识不足期）展开第一条有未完成技术的线
  const autoLine =
    lines.find(l => techs.some(t => t.line === l && !s.techs[t.id] && canResearch(s, t).ok)) ??
    lines.find(l => techs.some(t => t.line === l && !s.techs[t.id]))
  for (const line of lines) {
    const lineTechs = techs.filter(t => t.line === line)
    const done = lineTechs.filter(t => s.techs[t.id]).length
    const hasOpen = techLineOpen[line] ?? line === autoLine
    const col = document.createElement('div')
    col.className = `tech-line${hasOpen ? ' open' : ''}`
    const head = document.createElement('div')
    head.className = 'line-head'
    head.innerHTML =
      `<span class="line-name">${LINE_NAMES[line]}</span>` +
      `<span class="line-dots"><span class="done">${'●'.repeat(done)}</span><span class="todo">${'○'.repeat(lineTechs.length - done)}</span></span>` +
      (line === autoLine ? '<span class="line-hint">研究线</span>' : '')
    head.addEventListener('click', () => {
      techLineOpen[line] = !hasOpen
      renderTech()
    })
    col.appendChild(head)
    if (!hasOpen) { el.appendChild(col); continue }
    for (const tech of lineTechs) {
      const node = document.createElement('div')
      const chk = canResearch(s, tech)
      if (s.techs[tech.id]) {
        // 已研究：单行徽章，点击回顾见识卡
        node.className = 'tech-done' + (tech.card ? ' has-card' : '')
        node.innerHTML = `<span class="t-check">✔</span>${tech.name}`
        if (tech.card) {
          node.addEventListener('click', () => showTechCard(tech.id))
          node.title = '点击回顾见识卡'
        }
        col.appendChild(node)
        continue
      }
      let cls = 'tech-node'
      if (chk.ok) cls += ' available'
      node.className = cls
      node.innerHTML =
        `<div class="t-name"><span>${tech.name}</span><span class="t-cost">${tech.cost > 0 ? '识' + tech.cost : ''}</span></div>` +
        `<div class="t-desc">${tech.desc}</div>` +
        (chk.ok ? '' : `<div class="t-req">${chk.reason}</div>`)
      if (chk.ok) {
        node.querySelector('.t-name')!.addEventListener('click', () => {
          research(s!, tech.id)
          if (s!.techs[tech.id]) showTechCard(tech.id)
        })
      }
      col.appendChild(node)
    }
    el.appendChild(col)
  }
}

// ── 工坊 ─────────────────────────────────────────────────────
function costHtml(cost: { res: string; qty: number }[]): string {
  const s = THE_ST()
  return cost.map(c => {
    const have = s.res[c.res] ?? 0
    const name = RES_MAP.get(c.res)?.name ?? c.res
    return `<span class="${have < c.qty ? 'lack' : ''}">${name}${s.techs.knapping3 && c.res === 'stone' ? Math.ceil(c.qty / 2) : c.qty}</span>`
  }).join('　')
}

function renderBuildings(): void {
  const s = THE_ST()
  const el = $('#buildings')
  el.innerHTML = ''
  const buildings = all('building') as BuildingDef[]
  for (const b of buildings) {
    const built = s.buildings[b.id] ?? 0
    if (built > 0 && !['hut', 'kiln', 'shrine'].includes(b.id)) continue
    const locked = b.techReq && !s.techs[b.techReq]
    if (locked) continue
    const chk = canBuild(s, b.id)
    const row = document.createElement('div')
    row.className = 'bld-row'
    row.innerHTML =
      `<div class="r-name">${b.name}${built > 0 ? ` ×${built}` : ''}</div>` +
      `<div class="r-cost">${costHtml(b.cost)}</div>` +
      `<div class="r-desc">${b.desc}</div>`
    const btn = document.createElement('button')
    btn.textContent = '建造'
    btn.disabled = !chk.ok
    btn.title = chk.ok ? '' : chk.reason
    btn.onclick = () => build(THE_ST(), b.id)
    row.appendChild(btn)
    el.appendChild(row)
  }
}

function renderRecipes(): void {
  const s = THE_ST()
  const el = $('#recipes')
  el.innerHTML = ''
  const recipes = all('recipe') as Recipe[]
  for (const r of recipes) {
    if (r.techReq && !s.techs[r.techReq]) continue
    const mats = r.altMaterial
      ? [...r.materials.map(m => m.res === r.altMaterial!.res ? { ...m, qty: r.altMaterial!.qty } : m)]
      : r.materials
    const row = document.createElement('div')
    row.className = 'recipe-row'
    const failStep = r.steps.find(x => x.failure)
    const risk = failStep?.failure
      ? ` 失败率 ${failStep.failure.base * 100}%${(s.buildings.kiln ?? 0) > 0 || (r.facilityReq && (s.buildings[r.facilityReq] ?? 0) > 0) ? `（有设施 ${(failStep.failure.base + (failStep.failure.kiln ?? 0)) * 100}%）` : ''}`
      : ''
    row.innerHTML =
      `<div class="r-name">${r.name}</div>` +
      `<div class="r-cost">${costHtml(mats)}</div>` +
      `<div class="r-steps">${r.steps.map(x => x.name).join(' → ')}${risk ? '　' + risk.trim() : ''}</div>` +
      `<div class="r-desc">${r.desc}</div>`
    if (r.altMaterial) {
      const altLine = document.createElement('div')
      altLine.className = 'alt-line'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.id = `alt-${r.id}`
      const lb = document.createElement('label')
      lb.htmlFor = cb.id
      lb.textContent = `用${RES_MAP.get(r.altMaterial.res)?.name}替代（品质低）`
      altLine.appendChild(cb)
      altLine.appendChild(lb)
      row.appendChild(altLine)
    }
    const btn = document.createElement('button')
    btn.textContent = '开工'
    const chk = canStartRecipe(s, r.id, row.querySelector<HTMLInputElement>(`#alt-${r.id}`)?.checked ?? false)
    btn.disabled = !chk.ok
    btn.title = chk.ok ? '' : chk.reason
    btn.onclick = () => {
      const useAlt = row.querySelector<HTMLInputElement>(`#alt-${r.id}`)?.checked ?? false
      startRecipe(THE_ST(), r.id, useAlt)
      renderRecipes()
    }
    row.appendChild(btn)
    el.appendChild(row)
  }
  for (const t of TRIALS) {
    if (t.techReq && !s.techs[t.techReq]) continue
    if (s.flags[t.successFlag]) continue
    const row = document.createElement('div')
    row.className = 'recipe-row'
    row.innerHTML =
      `<div class="r-name">试错 · ${t.name}</div>` +
      `<div class="r-cost">${costHtml(t.cost)}　成功率 ${Math.round(t.successRate * 100)}%</div>` +
      `<div class="r-desc">失败也长见识（+${t.insightOnFail}）。成功见识 +${t.successInsight}。</div>`
    const btn = document.createElement('button')
    btn.textContent = '尝试'
    btn.disabled = !canStartTrial(s, t.id).ok
    btn.onclick = () => { startTrial(THE_ST(), t.id); renderRecipes() }
    row.appendChild(btn)
    el.appendChild(row)
  }
}

function renderQueue(): void {
  const s = THE_ST()
  const el = $('#queue')
  el.innerHTML = ''
  if (s.queue.length === 0) { el.innerHTML = '<div class="r-desc">工坊空闲。</div>'; return }
  s.queue.forEach((q, i) => {
    const item = document.createElement('div')
    item.className = 'queue-item'
    if (q.kind === 'recipe') {
      const r = RECIPE_MAP.get(q.id)
      if (!r) return
      const step = r.steps[q.stepIdx]
      item.innerHTML =
        `<div class="q-step">${i === 0 ? '▸' : '　'}${r.name} · ${step.name}</div>` +
        `<div class="q-risk">工序 ${q.stepIdx + 1}/${r.steps.length}${step.failure ? '　⚠ 本步有失败率' : ''}</div>` +
        `<div class="progress"><div style="width:${Math.min(100, (q.stepT / step.secs) * 100)}%"></div></div>`
    } else {
      const t = TRIAL_MAP.get(q.id)
      if (!t) return
      item.innerHTML =
        `<div class="q-step">${i === 0 ? '▸' : '　'}尝试 · ${t.name}</div>` +
        `<div class="progress"><div style="width:${Math.min(100, (q.stepT / t.secs) * 100)}%"></div></div>`
    }
    el.appendChild(item)
  })
}

// ── 日志 ─────────────────────────────────────────────────────
let renderedLog = 0
function renderLog(): void {
  const s = THE_ST()
  const el = $('#log')
  for (; renderedLog < s.log.length; renderedLog++) {
    const e = s.log[renderedLog]
    const line = document.createElement('div')
    line.className = 'log-line ' + e.cls
    const day = Math.floor(e.t / 60) + 1
    line.innerHTML = `<span class="log-day">第${day}天</span>${e.text}`
    el.appendChild(line)
  }
  el.scrollTop = el.scrollHeight
}

// ── 底栏 ─────────────────────────────────────────────────────
function setupActions(): void {
  // 视图切换：营地 / 世界
  document.querySelectorAll<HTMLButtonElement>('#view-tabs .tab').forEach(tab => {
    tab.onclick = () => switchView(tab.dataset.view as 'camp' | 'world')
  })
  $('#worldmap').addEventListener('click', ev => {
    if (currentView !== 'world') return
    const region = hitRegion(ev.currentTarget as HTMLCanvasElement, ev as MouseEvent, WORLD.regions)
    if (region) showRegionInfo(region)
  })
  $('#btn-cards').onclick = () => {
    const s = THE_ST()
    const box = document.createElement('div')
    box.className = 'card-box'
    const list = s.cards.map(id => {
      const t = TECH_MAP.get(id)
      if (!t?.card) return ''
      return `<div class="entry"><b>${t.card.title}</b><p>${t.card.text}</p></div>`
    }).join('')
    box.innerHTML = `<h3>见识图鉴</h3><div class="card-sub">已收集 ${s.cards.length} / ${(all('tech') as Tech[]).filter(t => t.card).length} 张</div>` +
      `<div class="card-list">${list || '<p>还没有收集到见识卡。</p>'}</div>`
    const btn = document.createElement('button')
    btn.textContent = '合上图鉴'
    btn.onclick = closeOverlay
    const act = document.createElement('div')
    act.className = 'card-actions'
    act.appendChild(btn)
    box.appendChild(act)
    showOverlay(box)
  }
  $('#btn-save').onclick = () => {
    const json = exportSave(THE_ST())
    const box = document.createElement('div')
    box.className = 'card-box'
    const ta = document.createElement('textarea')
    ta.style.width = '100%'
    ta.style.height = '160px'
    ta.value = json
    box.innerHTML = '<h3>导出存档</h3><div class="card-sub">复制下面的 JSON 妥善保存</div>'
    box.appendChild(ta)
    const dl = document.createElement('button')
    dl.textContent = '下载文件'
    dl.onclick = () => {
      const blob = new Blob([json], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'tribe-era-save.json'
      a.click()
    }
    const close = document.createElement('button')
    close.textContent = '关闭'
    close.onclick = closeOverlay
    const act = document.createElement('div')
    act.className = 'card-actions'
    act.appendChild(dl)
    act.appendChild(close)
    box.appendChild(act)
    showOverlay(box)
  }
  $('#btn-load').onclick = () => {
    const box = document.createElement('div')
    box.className = 'card-box'
    box.innerHTML = '<h3>导入存档</h3><div class="card-sub">粘贴导出的 JSON</div>'
    const ta = document.createElement('textarea')
    ta.style.width = '100%'
    ta.style.height = '160px'
    box.appendChild(ta)
    const ok = document.createElement('button')
    ok.className = 'primary'
    ok.textContent = '导入'
    ok.onclick = () => {
      const loaded = importSave(ta.value)
      if (loaded) {
        st = loaded
        renderedLog = 0
        $('#log').innerHTML = ''
        pushLog(st, 'good', '存档已恢复。')
        closeOverlay()
      } else {
        ta.value = '存档无效。'
      }
    }
    const cancel = document.createElement('button')
    cancel.textContent = '取消'
    cancel.onclick = closeOverlay
    const act = document.createElement('div')
    act.className = 'card-actions'
    act.appendChild(ok)
    act.appendChild(cancel)
    box.appendChild(act)
    showOverlay(box)
  }
  $('#btn-reset').onclick = () => {
    const box = document.createElement('div')
    box.className = 'card-box'
    box.innerHTML = '<h3>重新开始</h3><div class="card-text">当前进度将清空（导出存档除外）。确定吗？</div>'
    const yes = document.createElement('button')
    yes.className = 'danger'
    yes.textContent = '清空重来'
    yes.onclick = () => {
      clearSave()
      st = null
      renderedLog = 0
      $('#log').innerHTML = ''
      closeOverlay()
      showSetup()
    }
    const no = document.createElement('button')
    no.textContent = '取消'
    no.onclick = closeOverlay
    const act = document.createElement('div')
    act.className = 'card-actions'
    act.appendChild(yes)
    act.appendChild(no)
    box.appendChild(act)
    showOverlay(box)
  }
  $('#btn-auto').onclick = () => {
    const s = THE_ST()
    s.autoManage = !s.autoManage
    pushLog(s, '', s.autoManage ? '神明收回了指引，族人将自行劳作、自行摸索。' : '神明的目光重新落回营地。')
    renderAll()
  }
}

// ── 主循环 ───────────────────────────────────────────────────
let lastSave = 0
function loop(): void {
  const s = THE_ST()
  tick(s, 0.25)
  if (s.time - lastSave >= 15) {
    lastSave = s.time
    saveGame(s)
  }
}

function renderAll(): void {
  if (!st) return
  renderResources()
  renderPop()
  renderMiracles()
  renderExpedition()
  renderTech()
  renderBuildings()
  renderRecipes()
  renderQueue()
  renderLog()
  const s = THE_ST()
  const season = seasonOfNow(s)
  const day = Math.floor(s.time / TIME.secondsPerGameDay) + 1
  $('#sim-clock').textContent = `第 ${day} 天 · ${Math.floor((day - 1) / 360) + 1} 年`
  const seasonTag = $('#season-tag')
  seasonTag.textContent = SEASON_MODS[season].label
  seasonTag.title = SEASON_MODS[season].desc
  seasonTag.className = season
  $('#btn-auto').classList.toggle('on', !!s.autoManage)
  if (currentView === 'camp') {
    const ctx = ($('#camp') as HTMLCanvasElement).getContext('2d')!
    drawCamp(ctx, s, 800, 180)
  }
}

function offlineCatchup(): void {
  const s = THE_ST()
  if (!s.savedAt) return
  const elapsed = Math.min((Date.now() - s.savedAt) / 1000, TIME.maxOfflineCatchup)
  if (elapsed < 60) return
  const steps = 60
  const dt = elapsed / steps
  const before = { insight: s.res.insight, pop: s.pop, food: s.res.food, techs: Object.keys(s.techs).length }
  for (let i = 0; i < steps; i++) tick(s, dt)
  pushLog(s, 'good', `你离开的 ${Math.round(elapsed / 60)} 分钟里，文明仍在生长：见识 ${Math.floor(before.insight)}→${Math.floor(s.res.insight)}，技术 ${before.techs}→${Object.keys(s.techs).length} 项。`)
}

function main(): void {
  $('#ver-tag').textContent = VERSION
  setupActions()
  setInterval(loop, 250)
  setInterval(renderAll, 500)
  if (st) {
    offlineCatchup()
    renderAll()
  } else {
    showSetup()
  }
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }
}

main()

// 引用保活（类型导入被 tree-shake 时保持 API 面）
void raceMult
