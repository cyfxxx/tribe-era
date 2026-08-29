# 架构文档

> 目标：支撑**频繁修改与添加功能、物品、插件**。一切内容皆数据，改内容不改引擎。

## 1. 分层

```
┌────────────────────────────────────────────┐
│ ui/        DOM UI（灰盒）→ Phaser 场景（M3）│  只读状态 + 监听事件
├────────────────────────────────────────────┤
│ sim.ts     模拟核心（无 DOM，headless 可测）│  发领域事件
├────────────────────────────────────────────┤
│ core/      registry 事件总线 seasons races world │  纯数据+逻辑
├────────────────────────────────────────────┤
│ data/      内容包（builtin + 未来扩展包）  │  纯数据，可校验
└────────────────────────────────────────────┘
```

依赖方向单向向下：ui → sim → core → data。UI 不改状态，通过 sim 的动作函数。

## 2. 内容注册表（core/registry.ts）——扩展性的核心

- 所有内容（resource/tech/recipe/trial/building/race/region/event）经 `register(kind, def)` 注册，`pack` 字段标记来源包
- **新增内容的完整步骤**（以"新配方"为例）：
  1. 在 `data/` 对应文件加数据对象（或新建内容包文件）
  2. 在 `data/index.ts` 的 `registerAllContent()` 挂上
  3. `npm run check` + 启动——`validateAll()` 自动校验引用完整性（techReq/材料/产出/区域资源全部指向已注册内容），断裂立即报错
- 未来"插件"= 一个内容包 + 事件监听器（可选 `hooks.ts`），注册表天然支持按包开关

## 3. 事件总线（core/events.ts）

- sim 发类型化领域事件：`researched / built / crafted / craftFailed / trialDone / admitted / seasonChanged / regionEvent`
- UI 与插件只监听，不轮询、不反向依赖 sim 内部
- 事件可录制回放（未来用于离线摘要与调试）

## 4. 时间与四季（core/seasons.ts）

- 所有时间参数集中 `TIME` 常量（待定值改这里，不动逻辑）
- `seasonOf(gameDay)` 纯函数；四季系数 `SEASON_MODS`
- 接入点（M1）：sim tick 产出/消耗乘系数；季节切换 `emit seasonChanged`

## 5. 世界与种族（core/world.ts / core/races.ts）

- 两级地图 schema：`WorldMap`（大世界简略层）+ `RegionDef.detail`（文明详细层占位）
- 真实资源分布以 abundance 0-3 标注，区域 modifiers 描述地区特色
- 种族 `RaceDef`：bonuses 倍率（接入点在 sim 各产出计算处，M1）+ habitat tags（开局匹配）+ appearance（素材绘制规范）

## 6. 存档（state.ts）

- JSON + `version` 字段；双键轮换写（save/bak）模拟原子替换
- 迁移钩子 `migrate()`：逐版本升级，旧档先备份再改
- 存档只存**数值状态与 id**，不存引擎对象（内容定义永远从代码/注册表来）——内容变更不破坏旧档
- 导出/导入全量 JSON

## 7. 测试纪律（headless 优先）

- sim 与 core 无 DOM：`npm run sim` 跑策略 AI 数值模拟（固定种子，可断言通关时长/死锁/失败路径）
- 内容校验：启动时 `validateContent()`，CI/构建期也可跑
- 新增内容时若改变数值平衡：先在 simulate.ts 的 TECH_ORDER/策略里加覆盖，再跑 5 种子

## 8. 目录速览

```
src/
  core/     registry.ts events.ts seasons.ts races.ts world.ts
  data/     index.ts(注册+校验) resources/ techs/ recipes/ buildings/
  sim.ts    模拟核心        state.ts  存档
  main.ts   UI 绑定（将拆 ui/）
tools/      simulate.ts 数值模拟器
docs/       GDD.md ARCHITECTURE.md ROADMAP.md ASSETS.md
```

## 9. 演进约定

- 灰盒 UI（DOM）→ M3 换 Phaser 场景时，sim/core 零改动（UI 只消费状态与事件）
- 新系统（贸易/神力/事件）= 新内容类型注册 + 新事件类型，不改既有类型
- 破坏性 schema 变更必须 bump SAVE_VERSION 并写迁移
