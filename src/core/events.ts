// 类型化事件总线：sim 发领域事件，UI/插件只监听不改 sim（插件钩子的基础）
export type GameEvent =
  | { type: 'researched'; techId: string }
  | { type: 'built'; buildingId: string }
  | { type: 'crafted'; recipeId: string; outputRes: string; qty: number }
  | { type: 'craftFailed'; recipeId: string; stepName: string; insight: number }
  | { type: 'trialDone'; trialId: string; success: boolean }
  | { type: 'admitted'; pop: number }
  | { type: 'seasonChanged'; season: Season }
  | { type: 'regionEvent'; regionId: string; text: string }

import type { Season } from './seasons'

type Handler = (e: GameEvent) => void
const handlers = new Map<GameEvent['type'], Set<Handler>>()

export function on(type: GameEvent['type'], fn: Handler): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set())
  handlers.get(type)!.add(fn)
  return () => handlers.get(type)!.delete(fn) // 返回取消订阅
}

export function emit(e: GameEvent): void {
  handlers.get(e.type)?.forEach(fn => fn(e))
}

export function clearListeners(): void {
  handlers.clear()
}
