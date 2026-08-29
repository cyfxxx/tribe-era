// 存档：version 字段 + 双键轮换原子写 + 导出导入校验（save-systems 纪律）
import type { GameState } from './sim'
import { SAVE_VERSION } from './sim'
const KEY = 'tribe-era-save'
const KEY_BAK = 'tribe-era-save-bak'

export function saveGame(state: GameState): void {
  try {
    const prev = localStorage.getItem(KEY)
    if (prev) localStorage.setItem(KEY_BAK, prev)
    state.savedAt = Date.now()
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('save failed', e)
  }
}

export function loadGame(): GameState | null {
  for (const k of [KEY, KEY_BAK]) {
    const raw = localStorage.getItem(k)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as GameState
      const migrated = migrate(parsed)
      if (migrated) return migrated
    } catch (e) {
      console.warn(`parse failed for ${k}, trying backup`, e)
    }
  }
  return null
}

/** 逐版本迁移：每档补默认字段，不丢数据 */
function migrate(state: GameState): GameState | null {
  if (state.version > SAVE_VERSION) return null
  if (state.version < SAVE_VERSION) {
    // v1 → v2：种族/区域/信仰/远征/治理字段
    if (state.version === 1) {
      state.faithBoostT = undefined
      state.autoManage = state.autoManage ?? false
      state.expedition = state.expedition ?? null
      state.lastEventT = state.lastEventT ?? 0
      state.freeUnlocks = state.freeUnlocks ?? false
      state.savedAt = Date.now()
      state.version = 2
    }
  }
  return state
}

export function exportSave(state: GameState): string {
  return JSON.stringify(state, null, 2)
}

export function importSave(json: string): GameState | null {
  try {
    const parsed = JSON.parse(json) as GameState
    if (typeof parsed.version !== 'number') return null
    if (typeof parsed.time !== 'number') return null
    if (!parsed.res || !parsed.jobs) return null
    return migrate(parsed)
  } catch {
    return null
  }
}

export function clearSave(): void {
  localStorage.removeItem(KEY)
  localStorage.removeItem(KEY_BAK)
}
