# 插件系统设计（调研 + 方案）

> v1（2026-08-29）· 回答"游戏如何让插件改变内容"，并给出《部落纪元》的落地方案
> 定位：ARCHITECTURE.md 的扩展篇。实现排期见 ROADMAP M1.5

## 1. 调研：成熟游戏的插件实现机制

### 模式 A：数据注册（声明式内容包）
**代表**：Factorio data 阶段、RimWorld XML Defs、Stardew Valley Content Patcher
- 插件提供**纯声明式数据**（物品/配方/技术定义），引擎在**加载期**把它们注册进内容库
- 引擎规定加载顺序（依赖/优先级拓扑），同 id 后注册者报错或按规则覆盖
- 优点：安全（不改代码）、写 mod 门槛低、可静态校验引用
- 这正是本项目 `core/registry.ts` 已有的地基

### 模式 A+：声明式补丁（patch 别人的内容）
**代表**：RimWorld XML PatchOperations（xpath）、KSP ModuleManager（NEEDS/FOR/AFTER 语法）、Minecraft 数据包
- 关键问题：两个 mod 改同一个官方内容怎么办？——不重新注册，而是**对已注册内容打补丁**
- 补丁语法是**条件化声明式操作**：`改字段 / 删节点 / 插列表项`，带 `if（某 mod 存在）` 前置
- 补丁在内容校验**之前**按序应用，最终内容库只含补丁后的结果——冲突显式化、可预测

### 模式 B：事件钩子（行为挂点）
**代表**：Factorio control 阶段、Minecraft Forge/Fabric 事件总线、SMAPI 事件
- 引擎在关键节点（tick/研究完成/建造/合成）发事件，插件订阅并改变行为
- 插件**不调用引擎内部**，只消费事件 + 调引擎暴露的白名单 API
- 与模式 A 正交：数据包加内容，钩子包改行为，互不冲突

### 模式 C：运行时注入（改引擎本体）
**代表**：Minecraft Mixin（字节码级方法注入）、RimWorld Harmony（运行时方法改写）
- 能力最强：改引擎任何内部逻辑；风险最高：引擎一升级 mod 全碎，冲突靠优先级仲裁
- 结论：**单机自研游戏不建议开放此层**，官方 API 覆盖不到的能力应补 API 而不是开注入

### 模式 D：沙箱脚本
**代表**：Factorio 的 Lua 沙箱（mod 代码只能用引擎暴露的 `script` 面）、Minecraft Bedrock Script API、Roblox
- 插件代码跑在受限解释器/隔离环境，只有白名单 API 可达，越权不可能
- API 带**版本号**，游戏升级先保旧 API 再废弃——这是 mod 生态不烂尾的关键
- 网页端落地形态：Web Worker（postMessage 通信）或 QuickJS-WASM 解释器

### 同类网页游戏实践（Kittens Game）
- mod = zip（manifest + main.js），游戏内上传/启用；运行时以脚本注入执行，**开放全局游戏对象**
- mod 可注册新 tab/资源/建筑/科技，直接调用 `game` 对象改状态
- 特点：门槛极低、生态活跃；代价：无沙箱（信任 mod）、版本兼容靠社区自律
- 置信度说明：机制基于公开实践与仓库结构，未逐行核对源码（85%）

### 调研总结：四个正交层

| 层 | 解决什么 | 风险 | 实现成本 |
|---|---|---|---|
| A 数据注册 | 加新东西 | 无 | 已有（registry）|
| A+ 补丁 | 改已有东西 | 低（显式化）| 低 |
| B 事件钩子 | 改规则行为 | 中（需 API 白名单）| 中 |
| C 注入 / D 沙箱 | 改引擎/跑三方代码 | 高 / 低但费工 | 高 / 高 |

## 2. 《部落纪元》的分级插件方案

目标对齐：用户要求"后续**频繁修改和添加**功能、物品、插件"。四级渐进，每一级独立可用：

### Tier 1 内容包（已有，`data/index.ts`）
- 纯数据：资源/技术/配方/建筑/种族/区域，经 `registerAll()` 注册
- 启动校验引用完整性，断裂即报错
- "插件"形态：`data/packs/<pack>/` 一个目录一个包 + `data/index.ts` 挂载（未来按需改为 manifest 扫描）

### Tier 2 声明式补丁（M1.5 新增，`core/patches.ts`）
针对"频繁修改"的痛点：改官方内容不用改源文件，写补丁包。
```ts
// 补丁示例：改陶器配方 + 给砍砸器加描述后缀
export const patch = {
  target: 'recipe', id: 'potteryFiring',
  ops: [
    { op: 'set', path: 'steps[3].failure.base', value: 0.7 },
    { op: 'rename', value: '窑烧陶器' },
  ],
  when: { packExists: 'builtin' },   // 条件应用
}
```
- 应用时机：所有内容包注册完 → 按 mod 加载顺序应用补丁 → **然后**才跑 `validateAll()`
- 操作集：set / merge / remove / insert / rename（路径用点链+下标）
- 冲突可检测：两个包 patch 同一目标同一路径 → 启动警告列出

### Tier 3 事件钩子包（M2）
- 插件带 `hooks.ts`，订阅 `core/events.ts` 领域事件（researched / crafted / seasonChanged / regionEvent…）
- 引擎暴露**白名单 API 面**（`engineApi`：读状态快照、发通知、调白名单动作），插件不可触达存档与内部实现
- 存档兼容：插件状态存独立命名空间 `save.mods.<packId>`

### Tier 4 沙箱脚本（远期，仅当开放第三方生态）
- Web Worker + postMessage 白名单协议（或 QuickJS-WASM）
- mod manifest：`{ id, version, apiVersion, dependencies[] }`；`apiVersion` 不匹配拒绝加载并提示
- 加载顺序 = 依赖图拓扑排序；环依赖报错

### 配套基建（跨 Tier）
- **mod 清单与开关**：游戏内面板启用/停用；停用内容包时校验存档残留引用（存档里的 tech id 若来自已停用包 → 标记"缺失内容"占位，不清数据）
- **API 版本化**：registry/事件/engineApi 的 schema 各带版本，破坏性变更升 major
- **冲突报告**：启动输出注册表冲突/补丁冲突清单（console + 游戏内日志）

## 3. 为什么这样分层

- 用户需求主频是"加内容 + 改内容"（Tier 1/2 覆盖 90% 场景），成本最低、零运行时风险
- Tier 3 只在出现"改规则"类插件需求时做（如自定义胜利、难度曲线 mod）
- Tier 4 在游戏有第三方 mod 生态诉求前不投入——网页单机游戏先保证 Tier 1–3 的稳定 API，生态才有地基
