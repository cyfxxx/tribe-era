// UI 层：DOM 灰盒，状态每 500ms 全量刷新（量小无性能问题）
import {
  createInitialState, tick, pushLog, popCap, resCap, foodBurn, admitCost,
  canResearch, research, canBuild, build,
  canStartRecipe, startRecipe, canStartTrial, startTrial,
  admitPop, assignJob, JOBS, type GameState,
} from './sim'
import { RES_MAP } from './data/resources'
import { TECHS, TECH_MAP, LINE_NAMES, type TechLine } from './data/techs'
import { BUILDINGS } from './data/buildings'
import { RECIPES, TRIALS, RECIPE_MAP, TRIAL_MAP } from './data/recipes'
import { saveGame, loadGame, exportSave, importSave, clearSave } from './state'

let st: GameState = loadGame() ?? createInitialState()

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T

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

// ── 资源条 ───────────────────────────────────────────────────
function renderResources(): void {
  const bar = $('#resource-bar')
  bar.innerHTML = ''
  const ids = ['food', 'wood', 'stone', 'flint', 'fiber', 'clay', 'pottery', 'insight', 'crudeAxe', 'handAxe', 'digStick']
  for (const id of ids) {
    const def = RES_MAP.get(id)
    if (!def) continue
    const v = st.res[id] ?? 0
    const cap = resCap(st, id)
    const chip = document.createElement('span')
    chip.className = 'res-chip' + (cap > 0 && v >= cap ? ' full' : '')
    const capTxt = cap > 0 ? ` / ${cap}` : ''
    chip.innerHTML = `<span class="res-name">${def.name}</span><span class="res-qty">${Math.floor(v)}${capTxt}</span>`
    bar.appendChild(chip)
  }
}

// ── 人口与职业 ───────────────────────────────────────────────
function renderPop(): void {
  const used = Object.values(st.jobs).reduce((a, b) => a + b, 0)
  $('#pop-summary').innerHTML =
    `族人 <b>${st.pop}</b> / ${popCap(st)}　已分配 <b>${used}</b><br>` +
    `进食 −${foodBurn(st).toFixed(2)}/秒`
  const jobsEl = $('#jobs')
  jobsEl.innerHTML = ''
  for (const job of JOBS) {
    const locked = job.techReq && !st.techs[job.techReq]
    if (locked) continue
    const row = document.createElement('div')
    row.className = 'job-row'
    const n = st.jobs[job.id] ?? 0
    row.innerHTML = `<span class="job-name">${job.name}</span>` +
      `<button data-j="${job.id}" data-d="-1" type="button">−</button>` +
      `<span class="job-num">${n}</span>` +
      `<button data-j="${job.id}" data-d="1" type="button" ${used >= st.pop ? 'disabled' : ''}>＋</button>` +
      `<span class="job-rate">${(job.rate * 60).toFixed(1)}/分</span>`
    jobsEl.appendChild(row)
  }
  jobsEl.querySelectorAll('button').forEach(b => {
    b.onclick = () => assignJob(st, (b as HTMLElement).dataset.j!, Number((b as HTMLElement).dataset.d))
  })
  const act = $('#actions')
  if (!act.dataset.built) {
    act.dataset.built = '1'
    const admit = document.createElement('button')
    admit.className = 'primary'
    admit.textContent = `接纳族人（食物 ${admitCost(st)}）`
    admit.onclick = () => admitPop(st)
    act.appendChild(admit)
  }
}

// ── 技术树 ───────────────────────────────────────────────────
function renderTech(): void {
  const el = $('#techtree')
  el.innerHTML = ''
  const lines: TechLine[] = ['fire', 'knapping', 'pottery', 'agri', 'metal']
  for (const line of lines) {
    const col = document.createElement('div')
    col.className = 'tech-line'
    col.innerHTML = `<h3>${LINE_NAMES[line]}</h3>`
    for (const tech of TECHS.filter(t => t.line === line)) {
      const node = document.createElement('div')
      const chk = canResearch(st, tech)
      let cls = 'tech-node'
      if (st.techs[tech.id]) cls += ' researched'
      else if (chk.ok) cls += ' available'
      node.className = cls
      node.innerHTML =
        `<div class="t-name"><span>${tech.name}</span><span class="t-cost">${tech.cost > 0 ? '识' + tech.cost : ''}</span></div>` +
        `<div class="t-desc">${tech.desc}</div>` +
        (st.techs[tech.id] ? '' : chk.ok ? '' : `<div class="t-req">${chk.reason}</div>`) +
        (st.techs[tech.id] && tech.card ? '<div class="t-req">点击回顾见识卡</div>' : '')
      if (chk.ok || st.techs[tech.id]) {
        node.querySelector('.t-name')!.addEventListener('click', () => {
          if (st.techs[tech.id]) { showTechCard(tech.id); return }
          research(st, tech.id)
          if (st.techs[tech.id]) showTechCard(tech.id)
        })
      }
      col.appendChild(node)
    }
    el.appendChild(col)
  }
}

// ── 工坊 ─────────────────────────────────────────────────────
function costHtml(cost: { res: string; qty: number }[]): string {
  return cost.map(c => {
    const have = st.res[c.res] ?? 0
    const name = RES_MAP.get(c.res)?.name ?? c.res
    return `<span class="${have < c.qty ? 'lack' : ''}">${name}${st.techs.knapping3 && c.res === 'stone' ? Math.ceil(c.qty / 2) : c.qty}</span>`
  }).join('　')
}

function renderBuildings(): void {
  const el = $('#buildings')
  el.innerHTML = ''
  for (const b of BUILDINGS) {
    const built = st.buildings[b.id] ?? 0
    if (built > 0 && !['hut', 'kiln'].includes(b.id)) continue // 可重复建筑只显示首个提示
    const locked = b.techReq && !st.techs[b.techReq]
    if (locked) continue
    const chk = canBuild(st, b.id)
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
    btn.onclick = () => build(st, b.id)
    row.appendChild(btn)
    el.appendChild(row)
  }
}

function renderRecipes(): void {
  const el = $('#recipes')
  el.innerHTML = ''
  for (const r of RECIPES) {
    if (r.techReq && !st.techs[r.techReq]) continue
    const mats = r.altMaterial
      ? [...r.materials.map(m => m.res === r.altMaterial!.res ? { ...m, qty: r.altMaterial!.qty } : m)]
      : r.materials
    const row = document.createElement('div')
    row.className = 'recipe-row'
    const failStep = r.steps.find(s => s.failure)
    const risk = failStep?.failure
      ? ` 失败率 ${failStep.failure.base * 100}%${(st.buildings.kiln ?? 0) > 0 ? `（窑 ${(failStep.failure.base + (failStep.failure.kiln ?? 0)) * 100}%）` : ''}`
      : ''
    row.innerHTML =
      `<div class="r-name">${r.name}</div>` +
      `<div class="r-cost">${costHtml(mats)}</div>` +
      `<div class="r-steps">${r.steps.map(s => s.name).join(' → ')}${risk ? '　' + risk.trim() : ''}</div>` +
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
    const alt = row.querySelector<HTMLInputElement>(`#alt-${r.id}`)?.checked ?? false
    btn.disabled = !canStartRecipe(st, r.id, alt).ok
    btn.onclick = () => {
      const useAlt = row.querySelector<HTMLInputElement>(`#alt-${r.id}`)?.checked ?? false
      startRecipe(st, r.id, useAlt)
      renderRecipes()
    }
    row.appendChild(btn)
    el.appendChild(row)
  }
  // 试错活动
  for (const t of TRIALS) {
    if (t.techReq && !st.techs[t.techReq]) continue
    if (st.flags[t.successFlag]) continue
    const row = document.createElement('div')
    row.className = 'recipe-row'
    row.innerHTML =
      `<div class="r-name">试错 · ${t.name}</div>` +
      `<div class="r-cost">${costHtml(t.cost)}　成功率 ${Math.round(t.successRate * 100)}%</div>` +
      `<div class="r-desc">失败也长见识（+${t.insightOnFail}）。成功见识 +${t.successInsight}。</div>`
    const btn = document.createElement('button')
    btn.textContent = '尝试'
    btn.disabled = !canStartTrial(st, t.id).ok
    btn.onclick = () => { startTrial(st, t.id); renderRecipes() }
    row.appendChild(btn)
    el.appendChild(row)
  }
}

function renderQueue(): void {
  const el = $('#queue')
  el.innerHTML = ''
  if (st.queue.length === 0) { el.innerHTML = '<div class="r-desc">工坊空闲。</div>'; return }
  st.queue.forEach((q, i) => {
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
  const el = $('#log')
  for (; renderedLog < st.log.length; renderedLog++) {
    const e = st.log[renderedLog]
    const line = document.createElement('div')
    line.className = 'log-line ' + e.cls
    const day = Math.floor(e.t / 60) + 1
    line.innerHTML = `<span class="log-day">第${day}天</span>${e.text}`
    el.appendChild(line)
  }
  el.scrollTop = el.scrollHeight
}

// ── 底栏 ─────────────────────────────────────────────────────
function setupBottombar(): void {
  $('#btn-cards').onclick = () => {
    const box = document.createElement('div')
    box.className = 'card-box'
    const list = st.cards.map(id => {
      const t = TECH_MAP.get(id)
      if (!t?.card) return ''
      return `<div class="entry"><b>${t.card.title}</b><p>${t.card.text}</p></div>`
    }).join('')
    box.innerHTML = `<h3>见识图鉴</h3><div class="card-sub">已收集 ${st.cards.length} / ${TECHS.filter(t => t.card).length} 张</div>` +
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
    const json = exportSave(st)
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
      st = createInitialState()
      renderedLog = 0
      $('#log').innerHTML = ''
      closeOverlay()
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
}

// ── 主循环 ───────────────────────────────────────────────────
let lastSave = 0
function loop(): void {
  tick(st, 0.25)
  if (st.time - lastSave >= 15) {
    lastSave = st.time
    saveGame(st)
  }
}

function renderAll(): void {
  renderResources()
  renderPop()
  renderTech()
  renderBuildings()
  renderRecipes()
  renderQueue()
  renderLog()
  const day = Math.floor(st.time / 60) + 1
  $('#sim-clock').textContent = `第 ${day} 天`
}

function main(): void {
  setupBottombar()
  setInterval(loop, 250)
  setInterval(renderAll, 500)
  renderAll()
  window.addEventListener('beforeunload', () => saveGame(st))
}

main()
