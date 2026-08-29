// 配方定义：材料 + 工序序列 + 失败判定（拟真核心）
// 中间工序不入库，队列内逐步推进；关键步（如烧制）按设施 roll 失败
export interface RecipeStep {
  name: string
  secs: number
  /** 失败判定步：失败率 = base + kiln（泥壳窑建成后的修正） */
  failure?: {
    base: number
    kiln?: number
    insightOnFail: number
    failMsg: string
    /** 设施不足时额外提示（引导建造） */
    hintIfNoKiln?: string
  }
}

export interface Recipe {
  id: string
  name: string
  techReq?: string
  /** 设施门槛：开工前必须已建成该建筑（如锻炉熔炼） */
  facilityReq?: string
  materials: { res: string; qty: number }[]
  /** 替代主材料：品质降低（拟真：燧石 vs 普通石料） */
  altMaterial?: { res: string; qty: number; quality: number }
  /** 默认品质倍率（工具效率） */
  quality?: number
  output: { res: string; qty: number }
  steps: RecipeStep[]
  desc: string
}

export const RECIPES: Recipe[] = [
  {
    id: 'smeltCopper', name: '熔炼铜',
    techReq: 'metal4', facilityReq: 'furnace',
    materials: [{ res: 'copperOre', qty: 5 }, { res: 'wood', qty: 4 }],
    output: { res: 'copper', qty: 2 },
    steps: [
      { name: '选矿粉碎', secs: 15 },
      { name: '入炉焙烧', secs: 30 },
      {
        name: '还原出铜', secs: 30,
        failure: {
          base: 0.3, kiln: -0.1, insightOnFail: 10,
          failMsg: '炉温差了一点，铜水冻在半路——鼓风要更用力。',
        },
      },
    ],
    desc: '孔雀石五份熔得铜两锭。炉温是关键。',
  },
  {
    id: 'smeltBronze', name: '熔炼青铜',
    techReq: 'metal5', facilityReq: 'furnace',
    materials: [{ res: 'copper', qty: 9 }, { res: 'tinOre', qty: 3 }],
    output: { res: 'bronze', qty: 3 },
    steps: [
      { name: '配比称料', secs: 15 },
      {
        name: '合炉共熔', secs: 40,
        failure: {
          base: 0.35, kiln: -0.15, insightOnFail: 10,
          failMsg: '配比失手，铜水太软或太脆——九比一，记下来。',
        },
      },
      { name: '入模成形', secs: 20 },
    ],
    desc: '铜九锡一（矿石折算），青铜三锭。硬度远超纯铜。',
  },
  {
    id: 'bronzeAxe', name: '范铸青铜斧',
    techReq: 'metal6', facilityReq: 'furnace',
    materials: [{ res: 'copper', qty: 2 }, { res: 'bronze', qty: 3 }, { res: 'wood', qty: 2 }],
    output: { res: 'bronzeAxe', qty: 1 },
    steps: [
      { name: '制范合范', secs: 15 },
      {
        name: '浇铸', secs: 25,
        failure: { base: 0.15, kiln: 0, insightOnFail: 8, failMsg: '浇铸时范内进气，斧身夹了气泡——浇口要再顺一些。' },
      },
      { name: '开范修刃', secs: 15 },
    ],
    desc: '斧刃之光。伐木效率翻倍，耐久远超石器。',
  },
  {
    id: 'crudeAxe', name: '打制砍砸器',
    materials: [{ res: 'stone', qty: 3 }, { res: 'wood', qty: 2 }, { res: 'fiber', qty: 1 }],
    output: { res: 'crudeAxe', qty: 1 },
    steps: [
      { name: '锤击取片', secs: 8 },
      { name: '修整刃口', secs: 6 },
      { name: '纤维绑柄', secs: 6 },
    ],
    desc: '几块石头几根纤维，营地最基础的帮手。',
  },
  {
    id: 'handAxe', name: '打制手斧',
    techReq: 'knapping2',
    materials: [{ res: 'flint', qty: 3 }, { res: 'stone', qty: 2 }, { res: 'wood', qty: 2 }],
    altMaterial: { res: 'stone', qty: 6, quality: 1.0 },
    quality: 1.5,
    output: { res: 'handAxe', qty: 1 },
    steps: [
      { name: '两面剥片', secs: 14 },
      { name: '修型对称', secs: 12 },
      { name: '安装木柄', secs: 8 },
    ],
    desc: '泪滴形手斧。燧石制（品质高），或用普通石料替代（品质低）。',
  },
  {
    id: 'digStick', name: '削制石铲',
    techReq: 'knapping4',
    materials: [{ res: 'wood', qty: 3 }, { res: 'stone', qty: 1 }, { res: 'fiber', qty: 2 }],
    output: { res: 'digStick', qty: 1 },
    steps: [
      { name: '削制木杆', secs: 10 },
      { name: '镶嵌石刃', secs: 10 },
    ],
    desc: '木杆绑石刃。挖粘土与垦田的利器。',
  },
  {
    id: 'potteryFiring', name: '烧制陶器',
    techReq: 'pottery2',
    materials: [{ res: 'clay', qty: 4 }],
    output: { res: 'pottery', qty: 2 },
    steps: [
      { name: '淘洗粘土', secs: 15 },
      { name: '捏塑成坯', secs: 20 },
      { name: '阴干坯体', secs: 45 },
      {
        name: '入火烧结', secs: 40,
        failure: {
          base: 0.75, kiln: -0.67, insightOnFail: 12,
          failMsg: '陶坯在火堆里炸裂了——篝火的温度大概只有六百度，不够。',
          hintIfNoKiln: '需要更旺更封闭的火。也许该用泥壳把窑室围起来……（建造「泥壳窑」）',
        },
      },
    ],
    desc: '粘土四份烧陶器两件。露天堆烧成品率低，窑烧则高得多。',
  },
]

export const RECIPE_MAP = new Map(RECIPES.map(r => [r.id, r]))

/** 一次性试错活动（不产物品，产见识：验证「试错→见识」循环） */
export interface TrialDef {
  id: string
  name: string
  techReq?: string
  cost: { res: string; qty: number }[]
  secs: number
  /** 成功率（泥壳窑等设施修正见 sim） */
  successRate: number
  insightOnFail: number
  failMsg: string
  successMsg: string
  successFlag: string
  successInsight: number
}

export const TRIALS: TrialDef[] = [
  {
    id: 'fireDrill', name: '钻木取火',
    techReq: 'fire2',
    cost: [{ res: 'wood', qty: 2 }],
    secs: 20,
    successRate: 0.35,
    insightOnFail: 2,
    failMsg: '钻杆冒烟了，火星却没接住。「热要攒够」——族人们又记下了一条经验。',
    successMsg: '一缕白烟腾起，火绒被小心地吹亮——营地终于能自己生火了！',
    successFlag: 'trial_fireDrill',
    successInsight: 15,
  },
]

export const TRIAL_MAP = new Map(TRIALS.map(t => [t.id, t]))
