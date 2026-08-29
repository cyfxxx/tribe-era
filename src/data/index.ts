// 内容包汇总：新内容 = 在对应 pack 目录加数据文件 + 在此注册
// 校验在启动时执行，引用断裂立即报错（防频繁添加内容时埋雷）
import { registerAll, validateAll, type ValidationError } from '../core/registry'
import { RESOURCES } from './resources'
import { TECHS } from './techs'
import { RECIPES, TRIALS } from './recipes'
import { BUILDINGS } from './buildings'
import { registerRaces } from '../core/races'
import { registerRegions } from '../core/world'

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

export function validateContent(): ValidationError[] {
  registerAllContent()
  return validateAll()
}
