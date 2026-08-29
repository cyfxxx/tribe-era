// Tier 2 声明式补丁：对已注册内容打补丁（对齐 RimWorld PatchOperations / KSP ModuleManager 思路）
// 应用时机：所有内容包注册完 → 按包顺序应用补丁 → 然后才 validateAll()
import { forceRegister, get, type ContentDef, type ContentKind } from './registry'

export type PatchOpKind = 'set' | 'merge' | 'remove' | 'insert' | 'rename'

export interface PatchOp {
  op: PatchOpKind
  /** 点链路径 + 数组下标：steps[2].secs；rename 时省略 */
  path: string
  /** set/merge/insert 的新值；remove 无需；rename 为新名称 */
  value?: unknown
}

export interface ContentPatch {
  /** 来源包 id（冲突报告用） */
  pack: string
  target: ContentKind
  id: string
  /** 条件应用：目标包存在时才应用 */
  when?: { packExists?: string }
  ops: PatchOp[]
}

export interface PatchConflict { a: string; b: string; target: string; id: string; path: string }

/** 路径读写：支持 a.b.c 与 arr[2] */
function resolve(root: unknown, path: string): { parent: Record<string, unknown> | unknown[]; key: string } | null {
  const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let cur: unknown = root
  for (let i = 0; i < tokens.length - 1; i++) {
    const k = tokens[i]
    const next = (cur as Record<string, unknown>)[k]
    if (next == null) return null
    cur = next
  }
  return { parent: cur as Record<string, unknown>, key: tokens[tokens.length - 1] }
}

function applyOp(def: ContentDef, op: PatchOp): void {
  if (op.op === 'rename') {
    def.name = op.value as string
    return
  }
  const r = resolve(def, op.path)
  if (!r) throw new Error(`补丁路径不存在：${op.path}`)
  if (op.op === 'set') (r.parent as Record<string, unknown>)[r.key] = op.value
  else if (op.op === 'merge') {
    const cur = (r.parent as Record<string, unknown>)[r.key]
    if (typeof cur !== 'object' || cur == null) throw new Error(`merge 目标不是对象：${op.path}`)
    Object.assign(cur, op.value as Record<string, unknown>)
  } else if (op.op === 'insert') {
    const arr = (r.parent as Record<string, unknown>)[r.key]
    if (!Array.isArray(arr)) throw new Error(`insert 目标不是数组：${op.path}`)
    arr.push(op.value)
  } else if (op.op === 'remove') {
    const parent = r.parent
    if (Array.isArray(parent)) parent.splice(Number(r.key), 1)
    else delete (parent as Record<string, unknown>)[r.key]
  }
}

export interface PatchResult { applied: number; skipped: ContentPatch[]; conflicts: PatchConflict[]; errors: string[] }

/** 按包顺序应用补丁；返回冲突/跳过/错误报告 */
export function applyPatches(patches: ContentPatch[]): PatchResult {
  const result: PatchResult = { applied: 0, skipped: [], conflicts: [], errors: [] }
  // 冲突检测：同 target:id+path 被不同包 set/merge
  const seen = new Map<string, string>()
  for (const p of patches) {
    for (const op of p.ops) {
      if (op.op !== 'set' && op.op !== 'merge') continue
      const key = `${p.target}:${p.id}:${op.path}`
      const prev = seen.get(key)
      if (prev && prev !== p.pack) result.conflicts.push({ a: prev, b: p.pack, target: p.target, id: p.id, path: op.path })
      seen.set(key, p.pack)
    }
  }
  for (const p of patches) {
    if (p.when?.packExists && !patches.some(x => x.pack === p.when!.packExists && x !== p)) {
      // packExists 检查基于补丁清单中是否存在该包的补丁（简化语义）
      result.skipped.push(p)
      continue
    }
    const def = get<ContentDef & Record<string, unknown>>(p.target, p.id)
    if (!def) { result.errors.push(`[${p.pack}] 补丁目标不存在：${p.target}:${p.id}`); continue }
    const clone = structuredClone(def)
    try {
      for (const op of p.ops) applyOp(clone, op)
      forceRegister(p.target, clone)
      result.applied++
    } catch (e) {
      result.errors.push(`[${p.pack}] 应用失败：${(e as Error).message}`)
    }
  }
  return result
}
