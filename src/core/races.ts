// 种族设定：六大兽人族。用户扮演神明选择引导的种族；
// 加成作用于对应系统的接入点见 ROADMAP（灰盒原型未接入数值）
import { registerAll } from './registry'

export interface RaceDef {
  id: 'fox' | 'cat' | 'dog' | 'ox' | 'hawk' | 'fish'
  name: string
  epithet: string
  /** 民族性格描述（影响惯性发展 AI 的研究/扩张倾向） */
  traits: string
  /** 系统加成倍率（1.0 = 无加成） */
  bonuses: Partial<Record<
    'research' | 'gather' | 'hunt' | 'build' | 'farm' | 'fish' | 'scout' | 'grow' | 'trade',
    number>>
  /** 栖息地偏好（与 region.tags 匹配） */
  habitat: { tags: string[]; elevation?: 'coast' | 'lowland' | 'highland'; coastal?: boolean; islands?: boolean }
  /** 像素风外观要点（供素材绘制/生成参考） */
  appearance: string
}

export const RACES: RaceDef[] = [
  {
    id: 'fox', name: '狐族', epithet: '聪慧',
    traits: '好奇、好学、爱捣鼓新东西；研究倾向最高，扩张谨慎。',
    bonuses: { research: 1.2 },
    habitat: { tags: ['forest', 'grassland'] },
    appearance: '瘦削修长，大尾，竖耳；服饰缀羽毛与骨饰，配色橙白。',
  },
  {
    id: 'cat', name: '猫族', epithet: '灵敏',
    traits: '敏捷、独立、狩猎天赋出众；采集与狩猎效率高。',
    bonuses: { gather: 1.15, hunt: 1.2 },
    habitat: { tags: ['grassland', 'forest', 'savanna'] },
    appearance: '轻盈流线，竖瞳，短毛多色；护腕与轻甲，配色以沙褐为主。',
  },
  {
    id: 'dog', name: '犬族', epithet: '忠勇',
    traits: '群居、忠诚、分工协作天然；人口增长与协作加成。',
    bonuses: { grow: 1.2, build: 1.1 },
    habitat: { tags: ['grassland', 'steppe'] },
    appearance: '健壮直立，垂耳或立耳，毛色棕黑灰；皮甲+绳结装饰。',
  },
  {
    id: 'ox', name: '牛族', epithet: '厚重',
    traits: '力量型，耐苦劳，农耕与建造的行家；行动稍慢。',
    bonuses: { build: 1.2, farm: 1.2, research: 0.95 },
    habitat: { tags: ['river_valley', 'plains'] },
    appearance: '魁梧宽肩，弯角，厚毛；石斧与犁具，配色深棕。',
  },
  {
    id: 'hawk', name: '鹰族', epithet: '翱翔',
    traits: '体型矮小但有一对大翅膀，栖于高山之巅；视野与探索无双，滑翔侦察先行。',
    bonuses: { scout: 1.5, gather: 0.9 },
    habitat: { tags: ['mountain', 'highland'], elevation: 'highland' },
    appearance: '矮小结实，巨翼（收拢时如披风），钩喙状鼻，羽冠；岩色羽毛。',
  },
  {
    id: 'fish', name: '鱼族', epithet: '渊栖',
    traits: '生活在海洋中的岛屿附近，潜泳与渔业大师；依赖水，远离海岸会衰弱。',
    bonuses: { fish: 1.5, scout: 1.1 },
    habitat: { tags: ['coast', 'island'], coastal: true, islands: true },
    appearance: '流线型，颈侧与小腿有鳍膜，肤色青灰带鳞光；贝骨饰物。',
  },
]

export const RACE_MAP = new Map(RACES.map(r => [r.id, r]))
export function registerRaces(pack: string): void {
  registerAll('race', RACES, pack)
}
