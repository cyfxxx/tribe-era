// 世界设定：两级地图 + 真实资源分布
// ① 大世界地图（简略）：大洲多边形 + 大型山脉/河流/湖泊 + 区域标记（开局选择/神明俯瞰）
// ② 文明地图（详细）：选中区域展开，地形/资源点/营地（经营玩法层，接入点见 ROADMAP）
// 坐标为归一化 [0-100]（x≈东经映射，y≈北纬映射），渲染时线性映射到画布
import { registerAll } from './registry'

export interface RegionDef {
  id: string
  name: string
  /** 大世界地图上的位置 */
  pos: [number, number]
  tags: string[]
  /** 四大文明发源地开局可选；其余通关基础内容后解锁 */
  startUnlocked: boolean
  /** 真实资源分布（abundance 0-3：贫乏/一般/丰富/顶级） */
  resources: { res: string; abundance: number }[]
  /** 地区特色修正（接入点见 ROADMAP） */
  modifiers: { key: string; label: string; desc: string }[]
  /** 文明地图详细层的数据占位：地形/资源点/动物群（后续填充） */
  detail?: unknown
}

export interface WorldMap {
  era: string
  continents: { name: string; polygon: [number, number][] }[]
  /** 地形色斑（biome 着色，渲染时裁剪到所属大洲） */
  terrains: { kind: 'desert' | 'forest' | 'steppe' | 'tundra'; center: [number, number]; rx: number; ry: number }[]
  ranges: { name: string; polyline: [number, number][] }[]
  rivers: { name: string; polyline: [number, number][] }[]
  lakes: { name: string; center: [number, number]; rx: number; ry: number }[]
  regions: RegionDef[]
}

export const WORLD: WorldMap = {
  era: 'new_stone_age', // 新石器时代晚期世界轮廓
  terrains: [
    // 真实气候带示意：撒哈拉/阿拉伯/戈壁沙漢，雨林，草原，苔原
    { kind: 'desert', center: [38, 62], rx: 9, ry: 5 },    // 撒哈拉
    { kind: 'desert', center: [50, 40], rx: 5, ry: 3 },    // 阿拉伯
    { kind: 'desert', center: [66, 27], rx: 6, ry: 3 },    // 戈壁
    { kind: 'desert', center: [86, 71], rx: 4, ry: 3 },    // 澳洲内陆
    { kind: 'forest', center: [30, 29], rx: 6, ry: 4 },    // 欧洲森林
    { kind: 'forest', center: [54, 34], rx: 4, ry: 3 },    // 印度季风林
    { kind: 'forest', center: [29, 49], rx: 6, ry: 6 },    // 亚马逊
    { kind: 'forest', center: [49, 71], rx: 6, ry: 4 },    // 刚果
    { kind: 'forest', center: [70, 36], rx: 5, ry: 2.5 },  // 华东季风林
    { kind: 'forest', center: [18, 15], rx: 8, ry: 5 },    // 北美针叶
    { kind: 'tundra', center: [58, 17], rx: 14, ry: 5 },   // 西伯利亚
    { kind: 'tundra', center: [62, 35], rx: 6, ry: 2.5 },  // 青藏高原
    { kind: 'steppe', center: [52, 30], rx: 9, ry: 4 },    // 中亚草原
    { kind: 'steppe', center: [50, 64], rx: 5, ry: 4 },    // 东非草原
    { kind: 'steppe', center: [20, 26], rx: 6, ry: 4 },    // 北美草原
  ],
  continents: [
    { name: '欧亚', polygon: [[8, 42], [18, 30], [30, 22], [48, 18], [62, 12], [78, 15], [88, 24], [92, 38], [84, 52], [70, 58], [58, 64], [48, 60], [40, 52], [28, 50], [16, 50]] },
    { name: '非洲', polygon: [[42, 58], [50, 54], [56, 60], [58, 70], [54, 82], [46, 88], [40, 80], [36, 68], [38, 60]] },
    { name: '北美', polygon: [[12, 12], [22, 8], [30, 14], [30, 26], [24, 34], [16, 32], [10, 24]] },
    { name: '南美', polygon: [[28, 40], [34, 42], [36, 54], [32, 66], [28, 62], [26, 50]] },
    { name: '澳洲', polygon: [[80, 64], [90, 64], [92, 72], [86, 78], [78, 74]] },
    { name: '东南亚群岛', polygon: [[74, 56], [80, 56], [82, 62], [76, 63]] },
  ],
  ranges: [
    { name: '喜马拉雅', polyline: [[58, 38], [64, 36], [70, 36]] },
    { name: '昆仑', polyline: [[56, 33], [64, 32]] },
    { name: '阿尔泰', polyline: [[56, 24], [64, 22]] },
    { name: '高加索', polyline: [[44, 27], [48, 26]] },
    { name: '阿尔卑斯', polyline: [[32, 30], [36, 29]] },
    { name: '阿特拉斯', polyline: [[32, 56], [38, 55]] },
    { name: '落基', polyline: [[16, 14], [20, 24]] },
    { name: '安第斯', polyline: [[28, 44], [32, 56], [33, 66]] },
    { name: '大分水岭', polyline: [[87, 66], [90, 70]] },
  ],
  rivers: [
    { name: '尼罗河', polyline: [[46, 74], [47, 66], [45, 58], [44, 54]] },
    { name: '幼发拉底-底格里斯', polyline: [[43, 34], [45, 35], [47, 33]] },
    { name: '印度河', polyline: [[51, 30], [52, 36]] },
    { name: '黄河', polyline: [[66, 33], [69, 32], [72, 30]] },
    { name: '长江', polyline: [[66, 36], [70, 37], [74, 36]] },
    { name: '亚马逊', polyline: [[27, 48], [32, 47], [35, 49]] },
    { name: '密西西比', polyline: [[20, 30], [22, 20]] },
  ],
  lakes: [
    { name: '贝加尔湖', center: [64, 22], rx: 1.2, ry: 2 },
    { name: '里海', center: [47, 29], rx: 1.5, ry: 3 },
    { name: '五大湖', center: [22, 16], rx: 3, ry: 1.5 },
    { name: '维多利亚湖', center: [52, 72], rx: 1.5, ry: 1.5 },
  ],
  regions: [
    // ── 四大文明发源地（开局可选）──
    {
      id: 'mesopotamia', name: '两河流域', pos: [45, 34], startUnlocked: true,
      tags: ['river_valley', 'cradle', 'plains'],
      resources: [
        { res: 'food', abundance: 3 }, { res: 'clay', abundance: 3 },
        { res: 'stone', abundance: 1 }, { res: 'wood', abundance: 1 },
        { res: 'flint', abundance: 1 },
      ],
      modifiers: [
        { key: 'alluvial', label: '冲积沃土', desc: '大河淤泥滋养，农耕产出提升。' },
        { key: 'trade_hub', label: '贸易枢纽', desc: '地处通衢，与远方部落交换稀缺资源的机会更多（木材与石料靠交换）。' },
        { key: 'timber_poor', label: '林木稀疏', desc: '本地木材贫乏——历史上两河文明正是因此发展出泥砖与长途贸易。' },
      ],
    },
    {
      id: 'nile', name: '尼罗河谷', pos: [44.5, 58], startUnlocked: true,
      tags: ['river_valley', 'cradle', 'desert_edge'],
      resources: [
        { res: 'food', abundance: 3 }, { res: 'stone', abundance: 3 },
        { res: 'clay', abundance: 2 }, { res: 'flint', abundance: 2 },
        { res: 'wood', abundance: 1 },
      ],
      modifiers: [
        { key: 'nile_flood', label: '河汛节律', desc: '定期泛滥带来沃土与稳定的收成预期。' },
        { key: 'quarry', label: '优质石料', desc: '谷地石灰岩与花岗岩，大型建造的天赋点。' },
      ],
    },
    {
      id: 'indus', name: '印度河流域', pos: [52, 33], startUnlocked: true,
      tags: ['river_valley', 'cradle', 'plains'],
      resources: [
        { res: 'food', abundance: 3 }, { res: 'clay', abundance: 2 },
        { res: 'wood', abundance: 2 }, { res: 'stone', abundance: 2 },
        { res: 'fiber', abundance: 2 },
      ],
      modifiers: [
        { key: 'planning', label: '规划天赋', desc: '季风与冲积平原孕育聚落规划传统，建造效率提升。' },
        { key: 'cotton', label: '纤维之始', desc: '棉的最早驯化地之一，纺织线起步更早。' },
      ],
    },
    {
      id: 'yellow_river', name: '黄河流域', pos: [70, 32], startUnlocked: true,
      tags: ['river_valley', 'cradle', 'loess'],
      resources: [
        { res: 'food', abundance: 2 }, { res: 'clay', abundance: 3 },
        { res: 'stone', abundance: 2 }, { res: 'wood', abundance: 2 },
        { res: 'flint', abundance: 2 },
      ],
      modifiers: [
        { key: 'loess', label: '黄土易耕', desc: '松软黄土用原始农具即可耕作，农业起步快。' },
        { key: 'loess_clay', label: '黄土陶土', desc: '细黄土是优质陶土，制陶加成。' },
      ],
    },
    // ── 通关基础内容后解锁 ──
    {
      id: 'australia_west', name: '澳洲西北', pos: [84, 68], startUnlocked: false,
      tags: ['savanna', 'coast', 'iron_country'],
      resources: [
        { res: 'stone', abundance: 3 }, { res: 'flint', abundance: 2 },
        { res: 'food', abundance: 1 }, { res: 'wood', abundance: 1 },
      ],
      modifiers: [
        { key: 'iron_rich', label: '铁矿之洲', desc: '露天富铁矿遍布地表，品位极佳——为青铜之后的时代埋下伏笔。' },
      ],
    },
    {
      id: 'anatolia', name: '安纳托利亚高地', pos: [41, 28], startUnlocked: false,
      tags: ['highland', 'copper_country'],
      resources: [
        { res: 'stone', abundance: 3 }, { res: 'flint', abundance: 2 },
        { res: 'wood', abundance: 2 }, { res: 'food', abundance: 2 },
        { res: 'copperOre', abundance: 3 }, { res: 'tinOre', abundance: 1 },
      ],
      modifiers: [
        { key: 'copper', label: '孔雀石之乡', desc: '露头铜矿易辨识，冶金的摇篮之一。' },
      ],
    },
    {
      id: 'andes', name: '安第斯高地', pos: [30, 52], startUnlocked: false,
      tags: ['mountain', 'coast'],
      resources: [
        { res: 'stone', abundance: 3 }, { res: 'food', abundance: 2 }, { res: 'clay', abundance: 2 },
      ],
      modifiers: [
        { key: 'vertical', label: '垂直生态', desc: '海拔落差带来从谷地到雪线的多样资源带。' },
      ],
    },
    {
      id: 'sea_isles', name: '东南亚群岛', pos: [78, 59], startUnlocked: false,
      tags: ['coast', 'island'],
      resources: [
        { res: 'food', abundance: 3 }, { res: 'wood', abundance: 3 }, { res: 'fiber', abundance: 2 },
      ],
      modifiers: [
        { key: 'fishery', label: '鱼汛之海', desc: '暖流交汇，渔获丰厚——鱼族的天选之地。' },
      ],
    },
    {
      id: 'altai', name: '阿尔泰山地', pos: [60, 23], startUnlocked: false,
      tags: ['mountain', 'steppe'],
      resources: [
        { res: 'stone', abundance: 2 }, { res: 'food', abundance: 1 }, { res: 'wood', abundance: 2 },
      ],
      modifiers: [
        { key: 'eagle_perch', label: '鹰巢之地', desc: '崖壁巢穴与上升气流，鹰族的天选之地。' },
      ],
    },
    {
      id: 'europe_flint', name: '欧洲燧石带', pos: [26, 32], startUnlocked: false,
      tags: ['forest', 'flint_country'],
      resources: [
        { res: 'flint', abundance: 3 }, { res: 'wood', abundance: 3 }, { res: 'food', abundance: 2 },
      ],
      modifiers: [
        { key: 'flint_belt', label: '燧石矿脉', desc: '白垩层燧石结核，石器工艺的天赋点。' },
      ],
    },
  ],
}

export const START_REGIONS = WORLD.regions.filter(r => r.startUnlocked)
export const REGION_MAP = new Map(WORLD.regions.map(r => [r.id, r]))

export function registerRegions(pack: string): void {
  registerAll('region', WORLD.regions, pack)
}
