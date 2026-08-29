// 存档：version 字段 + 双键轮换原子写 + 导出导入校验（save-systems 纪律）
import type { GameState } from './sim'

export const SAVE_VERSION = 1
const KEY = 'tribe-era-save'
const KEY_BAK = 'tribe-era-save-bak'

export function saveGame(state: GameState): void {
  try {
    // 轮换：旧档进 bak，新档写主键（等价于"写临时再替换"的降级实现）
    const prev = localStorage.getItem(KEY)
    if (prev) localStorage.setItem(KEY_BAK, prev)
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

function migrate(state: GameState): GameState | null {
  if (state.version === SAVE_VERSION) return state
  if (state.version < SAVE_VERSION) {
    // 未来版本迁移钩子：逐版本 upgrade
    return null
  }
  return null
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
