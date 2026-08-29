// 建筑定义：无失败判定（拟真失败集中在工艺），效果为容量/解锁
export interface BuildingDef {
  id: string
  name: string
  cost: { res: string; qty: number }[]
  techReq?: string
  desc: string
  effect: {
    popCap?: number
    foodCap?: number
    /** 解锁高级烧陶（陶窑烧成） */
    enablesKilnFiring?: boolean
  }
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'hut', name: '棚屋',
    cost: [{ res: 'wood', qty: 30 }],
    desc: '树枝与兽皮搭成的窝棚。人口上限 +4，食物上限 +30。',
    effect: { popCap: 4, foodCap: 30 },
  },
  {
    id: 'cellar', name: '地窖',
    cost: [{ res: 'stone', qty: 20 }, { res: 'wood', qty: 15 }],
    techReq: 'agri3',
    desc: '挖在地下干燥避鼠的储坑。食物上限 +120，木头上限 +60。',
    effect: { foodCap: 120 },
  },
  {
    id: 'kiln', name: '泥壳窑',
    cost: [{ res: 'stone', qty: 40 }, { res: 'wood', qty: 20 }, { res: 'clay', qty: 10 }],
    techReq: 'pottery1',
    desc: '泥壳围成的窑室，保温封烧。解锁「窑烧陶器」，成品率大幅提升。',
    effect: { enablesKilnFiring: true },
  },
  {
    id: 'furnace', name: '锻炉',
    cost: [{ res: 'stone', qty: 50 }, { res: 'wood', qty: 30 }, { res: 'clay', qty: 20 }],
    techReq: 'metal4',
    desc: '专用高温炉膛配鼓风。熔炼铜与青铜的必备设施。',
    effect: {},
  },
  {
    id: 'shrine', name: '祭坛',
    cost: [{ res: 'stone', qty: 15 }, { res: 'wood', qty: 10 }],
    desc: '堆石为坛，族人晨昏祷告。信仰积累 +0.06/秒。',
    effect: {},
  },
  {
    id: 'field', name: '小田',
    cost: [{ res: 'wood', qty: 10 }, { res: 'fiber', qty: 15 }],
    techReq: 'agri4',
    desc: '营地边缘的小片试种田，提供稳定食物产出（+0.25/秒）。',
    effect: {},
  },
]

export const BUILDING_MAP = new Map(BUILDINGS.map(b => [b.id, b]))
