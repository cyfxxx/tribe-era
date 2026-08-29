// 内容注册表：一切游戏内容（资源/技术/配方/建筑/种族/区域…）统一注册、可校验引用
// 扩展纪律：新内容 = 新数据文件 + 在 data/index.ts 注册；改内容不改引擎代码
export type ContentKind =
  | 'resource' | 'tech' | 'recipe' | 'trial' | 'building'
  | 'race' | 'region' | 'event'

export interface ContentDef { id: string; pack?: string; name?: string }

type RegistryMap = Map<ContentKind, Map<string, ContentDef>>

const registries: RegistryMap = new Map()

export function register<T extends ContentDef>(kind: ContentKind, def: T): T {
  if (!registries.has(kind)) registries.set(kind, new Map())
  const m = registries.get(kind)!
  if (m.has(def.id)) throw new Error(`[registry] 重复注册 ${kind}:${def.id}`)
  m.set(def.id, def)
  return def
}

/** 补丁系统专用：覆盖注册（仅 patches.ts 调用） */
export function forceRegister<T extends ContentDef>(kind: ContentKind, def: T): T {
  if (!registries.has(kind)) registries.set(kind, new Map())
  registries.get(kind)!.set(def.id, def)
  return def
}

export function registerAll<T extends ContentDef>(kind: ContentKind, defs: T[], pack: string): T[] {
  return defs.map(d => register(kind, { ...d, pack }))
}

export function get<T extends ContentDef>(kind: ContentKind, id: string): T | undefined {
  return registries.get(kind)?.get(id) as T | undefined
}

export function all<T extends ContentDef>(kind: ContentKind): T[] {
  return [...(registries.get(kind)?.values() ?? [])] as T[]
}

export interface ValidationError { kind: ContentKind; id: string; problem: string }

/**
 * 引用完整性校验：防止频繁添加内容时引用断裂。
 * 每类内容的引用字段在这里集中声明，新增内容类型时补一条规则即可。
 * 返回空数组 = 通过。
 */
export function validateAll(): ValidationError[] {
  const errors: ValidationError[] = []
  const mustExist = (kind: ContentKind, ref: string | undefined, fromId: string, field: string) => {
    if (ref && !get(kind, ref)) {
      errors.push({ kind, id: fromId, problem: `${field} 引用不存在的 ${kind}:${ref}` })
    }
  }
  for (const t of all<{ id: string; req?: string[] } & ContentDef>('tech')) {
    for (const r of t.req ?? []) mustExist('tech', r, t.id, 'req')
  }
  for (const r of all<{ id: string; techReq?: string; materials?: { res: string }[]; output?: { res: string }; altMaterial?: { res: string } } & ContentDef>('recipe')) {
    if (r.techReq) mustExist('tech', r.techReq, r.id, 'techReq')
    for (const m of r.materials ?? []) mustExist('resource', m.res, r.id, 'materials')
    if (r.output) mustExist('resource', r.output.res, r.id, 'output')
    if (r.altMaterial) mustExist('resource', r.altMaterial.res, r.id, 'altMaterial')
  }
  for (const b of all<{ id: string; techReq?: string; cost?: { res: string }[] } & ContentDef>('building')) {
    if (b.techReq) mustExist('tech', b.techReq, b.id, 'techReq')
    for (const c of b.cost ?? []) mustExist('resource', c.res, b.id, 'cost')
  }
  for (const t of all<{ id: string; techReq?: string; cost?: { res: string }[] } & ContentDef>('trial')) {
    if (t.techReq) mustExist('tech', t.techReq, t.id, 'techReq')
    for (const c of t.cost ?? []) mustExist('resource', c.res, t.id, 'cost')
  }
  for (const r of all<{ id: string; resources?: { res: string }[] } & ContentDef>('region')) {
    for (const rr of r.resources ?? []) mustExist('resource', rr.res, r.id, 'resources')
  }
  // id 冲突已由 register 抛错兜底；这里只查跨类引用
  return errors
}
