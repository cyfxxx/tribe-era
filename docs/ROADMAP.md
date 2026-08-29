# 路线图

> 里程碑制；每个里程碑结束跑 `npm run sim` + 浏览器实点回归。

## M0 灰盒原型 ✅（2026-08-29）
- 石器时代闭环：4+1 技术线 / 13 技术 / 工序失败 / 见识卡 / 存档
- headless 数值验证：5 种子通关 40–44 游戏日，无死锁
- 架构层就位：registry / events / seasons / races / world（两级地图 schema）

## M1 架构接入（下一步）
- [ ] 四季接入 sim（SEASON_MODS 乘进产出/消耗；seasonChanged UI 播报）
- [ ] 种族选择开局：RACE bonuses 接入产出计算；种族影响惯性 AI 权重
- [ ] 大世界地图渲染：Canvas 简略层（大洲/山脉/河流/湖泊/开局点），开局选择界面
- [ ] 区域 modifiers 接入产出（冲积沃土/黄土易耕等）
- [ ] 通关解锁自由选区（metal1 后 startUnlocked 之外开放）

## M1.5 插件系统（见 docs/PLUGINS.md）
- [ ] Tier 2 声明式补丁：core/patches.ts（set/merge/remove/insert/rename + 条件应用 + 冲突报告），补丁先于校验应用
- [ ] mod 清单与开关面板；停用包的存档残留引用处理（缺失内容占位）
- [ ] Tier 3 事件钩子包：hooks + engineApi 白名单；插件状态命名空间 save.mods.<packId>
- [ ] manifest（id/version/apiVersion/dependencies）与依赖拓扑加载顺序（Tier 4 前置）

## M2 神明层
- [ ] 惯性发展 AI 正式化（simulate.ts 策略 → sim/governor.ts，性格权重）
- [ ] 离线推进：真实时间流逝补 tick（TIME.maxOfflineCatchup 上限）+ 离线摘要
- [ ] 神力/信仰资源：来源与干预（启示=研究权重调整、丰收神迹、引路迁移）
- [ ] 现实时间驱动切换（TIME 参数定稿：1 现实月 = 1 游戏年，待验证手感）

## M3 像素化
- [ ] 文明地图详细层：tile 网格、资源点、建筑、族人活动（数据填 RegionDef.detail）
- [ ] 免费素材接入（Kenney/itch.io 包，见 ASSETS.md）；六族角色 sheet
- [ ] Phaser 4 场景替换灰盒 DOM（sim/core 不动）；昼夜循环
- [ ] 素材缺口 → comfyui-agent 生成或像素画技能补齐

## M4 内容扩展
- [ ] 青铜时代：冶金线展开（自然铜→退火→熔炼→青铜 9:1→范铸）；锡贸易
- [ ] 跨区域贸易（商队/订单）、动植物表（气候带）、事件系统（兽袭/好收成/迁徙）
- [ ] 多族共居规则；地区专属技术/事件

## M5 发布
- [ ] itch.io HTML5（butler push）；PWA（手机添加主屏）
- [ ] 中文本地化收尾；版本号与存档迁移演练

## 风险与对策
- 现实时间驱动手感不确定 → 参数集中 TIME，随时回退本地 tick
- 免费素材风格割裂 → 先定调色板与 tile 尺寸规范再选包；必要时统一重绘
- 内容膨胀引用断裂 → registry 启动校验 + CI 化
