// 时间与四季：现实时间驱动的异步放置（参数待定，集中一处可调）
// 设定：现实 1 个月 ≈ 游戏 1 年（待定）；灰盒原型 tick 仍用本地 250ms 循环，接入点见 ROADMAP
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/** 时间参数：集中一处，调参不改逻辑 */
export const TIME = {
  /** 灰盒原型：1 游戏日 = 60 秒（本地 tick） */
  secondsPerGameDay: 60,
  /** 正式版（待定）：现实 30 天 = 游戏 1 年 → 1 现实天 ≈ 12 游戏日 */
  realDaysPerGameYear: 30,
  /** 离线推进上限（秒），防数值崩坏 */
  maxOfflineCatchup: 8 * 3600,
}

/** 一年 360 游戏日（12 月 × 30 日），季节各 90 日 */
export const DAYS_PER_YEAR = 360

export function seasonOf(gameDay: number): Season {
  const d = ((gameDay % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR
  if (d < 90) return 'spring'
  if (d < 180) return 'summer'
  if (d < 270) return 'autumn'
  return 'winter'
}

export interface SeasonMod {
  label: string
  gather: number   // 采集/狩猎/渔业产出倍率
  build: number    // 建造与工序速度倍率
  food: number     // 食物消耗倍率
  desc: string
}

export const SEASON_MODS: Record<Season, SeasonMod> = {
  spring: { label: '春', gather: 1.1, build: 1.0, food: 1.0, desc: '万物生发，采集略丰，族群繁衍的好时节。' },
  summer: { label: '夏', gather: 1.0, build: 1.15, food: 1.05, desc: '日照充足，工事顺利，但消耗稍高。' },
  autumn: { label: '秋', gather: 1.2, build: 1.0, food: 0.9, desc: '收获的季节，块茎浆果累累。' },
  winter: { label: '冬', gather: 0.75, build: 0.9, food: 1.25, desc: '青黄不接，食物消耗加剧，围火过冬。' },
}
