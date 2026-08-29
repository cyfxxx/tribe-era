# 部落纪元 · 灰盒原型 v0.1

2D 休闲模拟经营放置游戏：从石器时代开始，点击采集、分配族人、点亮技术图谱，
把小营地发展成青铜时代城邦。**拟真卖点**：技术因果链贴近真实技术史（奥杜威→阿舍利→勒瓦娄哇；
篝火六百度烧不了陶→失败给见识→建泥壳窑），每个技术节点解锁一张真实历史「见识卡」。

## 运行

```bash
npm install
npm run dev        # 开发 http://localhost:5173
npm run build      # 产出 dist/（静态站，可直接发 itch.io HTML）
npm run preview    # 预览构建产物
npm run sim        # headless 数值模拟（5 种子验证通关/死锁/失败路径）
npm run check      # tsc 类型检查
```

## 原型验证结论（headless 模拟，5 种子）

- 全部种子在 40–44 游戏日内通关「窑边的绿石头」（青铜之门）
- 露天烧陶失败率 75%：首烧几乎必败 → 见识提示温度不足 → 解锁泥壳窑 → 窑烧 8% 失败
- 添丁成本随人口递增（50 + 12×n），棚屋同步扩容，防指数滚雪球
- 研究岗在分配优先级中保底，防全员生产导致知识停摆死锁

## 结构

```
src/
  data/    resources / techs(技术图谱+见识卡) / buildings / recipes(工序+失败判定)
  sim.ts   模拟核心（无 DOM 依赖，headless 可测）
  state.ts 存档（version + 双键轮换 + 导出导入）
  main.ts  DOM UI（500ms 全量刷新）
tools/simulate.ts  策略 AI 数值模拟
```

## 后续方向

- Phaser 村庄场景（建筑出现、昼夜、季节）替代灰盒
- 事件系统（野兽/好收成/迁徙）、青铜时代内容
- itch.io 发布（butler push HTML 通道）
