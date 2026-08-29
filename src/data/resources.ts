// 资源定义：raw 基础 / craft 成品 / tool 工具（有耐久）/ meta 元资源
export type ResourceKind = 'raw' | 'craft' | 'tool' | 'meta'

export interface ResourceDef {
  id: string
  name: string
  kind: ResourceKind
  /** 工具：作业间隔秒数（库存>0 时提供倍率，每 interval 消耗 1 点耐久） */
  durability?: number
  /** 工具提供的采集倍率 */
  boost?: number
  /** 基础存储上限（0 = 不设上限） */
  cap?: number
}

export const RESOURCES: ResourceDef[] = [
  { id: 'food',   name: '食物', kind: 'raw',  cap: 80 },
  { id: 'wood',   name: '木头', kind: 'raw',  cap: 100 },
  { id: 'stone',  name: '石料', kind: 'raw',  cap: 100 },
  { id: 'flint',  name: '燧石', kind: 'raw',  cap: 40 },
  { id: 'fiber',  name: '植物纤维', kind: 'raw', cap: 60 },
  { id: 'clay',   name: '粘土', kind: 'raw',  cap: 80 },
  { id: 'pottery',name: '陶器', kind: 'craft', cap: 30 },
  { id: 'insight',name: '见识', kind: 'meta', cap: 0 },
  { id: 'crudeAxe', name: '砍砸器', kind: 'tool', durability: 45, boost: 1.3 },
  { id: 'handAxe',  name: '手斧',   kind: 'tool', durability: 70, boost: 1.6 },
  { id: 'digStick', name: '石铲',   kind: 'tool', durability: 60, boost: 1.4 },
]

export const RES_MAP = new Map(RESOURCES.map(r => [r.id, r]))

/** 资源基础存储上限（会被建筑/技术加成，见 sim.ts） */
export const BASE_CAPS: Record<string, number> = Object.fromEntries(
  RESOURCES.filter(r => r.cap).map(r => [r.id, r.cap as number])
)
