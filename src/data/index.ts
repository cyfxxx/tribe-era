// 内容包汇总：新内容 = 在对应 pack 目录加数据文件 + 在此注册
// 流程：注册全部内容包 → 应用声明式补丁（Tier 2）→ 校验引用完整性
import { registerAll, validateAll, all, type ValidationError } from '../core/registry'
import { applyPatches, type PatchConflict } from '../core/patches'
import { RESOURCES } from './resources'
import { TECHS, TECH_MAP } from './techs'
import { RECIPES, TRIALS, RECIPE_MAP, TRIAL_MAP } from './recipes'
import { BUILDINGS, BUILDING_MAP } from './buildings'
import { registerRaces } from '../core/races'
import { registerRegions } from '../core/world'
import { EXAMPLE_PATCHES } from './patches.example'

export const PACK_BUILTIN = 'builtin'

let registered = false

export function registerAllContent(): void {
  if (registered) return
  registerAll('resource', RESOURCES, PACK_BUILTIN)
  registerAll('tech', TECHS, PACK_BUILTIN)
  registerAll('recipe', RECIPES, PACK_BUILTIN)
  registerAll('trial', TRIALS, PACK_BUILTIN)
  registerAll('building', BUILDINGS, PACK_BUILTIN)
  registerRaces(PACK_BUILTIN)
  registerRegions(PACK_BUILTIN)
  registered = true
}

/** 补丁应用后同步静态查询表（sim/UI 读 Map，registry 是唯一事实源） */
function syncMaps(): void {
  const pairs: [Parameters<typeof all>[0], Map<string, unknown>][] = [
    ['tech', TECH_MAP], ['recipe', RECIPE_MAP], ['trial', TRIAL_MAP], ['building', BUILDING_MAP],
  ]
  for (const [kind, map] of pairs) {
    map.clear()
    for (const d of all(kind)) map.set(d.id, d)
  }
}

export interface ContentReport {
  errors: ValidationError[]
  patchApplied: number
  patchConflicts: PatchConflict[]
  patchErrors: string[]
}

export function validateContent(): ContentReport {
  registerAllContent()
  const patchResult = applyPatches(EXAMPLE_PATCHES)
  syncMaps()
  return {
    errors: validateAll(),
    patchApplied: patchResult.applied,
    patchConflicts: patchResult.conflicts,
    patchErrors: patchResult.errors,
  }
}
