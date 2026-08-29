# 像素素材指南

> 原则：先免费（可商用），风格统一；没有合适的再制作（comfyui-agent 生成 / 像素画技能）。

## 优先来源（已核实在线）

| 来源 | 协议 | 说明 |
|---|---|---|
| [Kenney.nl](https://kenney.nl) | CC0 | 全站可商用；2D/像素/UI/音效全家桶，风格干净统一，首选打底 |
| [itch.io 免费像素区](https://itch.io/game-assets/free/tag-pixel-art) | 各异，须逐包核对 | 俯视角 16x16 包多（如 "Free - Pixel Art Asset Pack - Topdown Tileset - 16x16 Sprites"：500 精灵/3 英雄/8 敌人/50 武器），适合文明地图层 |
| [OpenGameArt.org](https://opengameart.org) | CC0/CC-BY/GBK 逐件核对 | 存量大，像素 chibi 角色包（48×48 动画）可用；注意逐件 license |
| CraftPix freebies | 免费商用需注册 | 单包质量高，license 逐包读 |
| FreePixel | 免费 | 56k+ sprites 聚合站，免注册 |

## 选型规范（先定规范再选包）

- **Tile 尺寸**：文明地图 16px 或 32px（二选一后全局统一）；大世界地图用符号层（非 tile 拼贴），只画山脉/河流/湖泊图标
- **调色板**：≤32 色（可参考现成限制调色板如 Apollo/Endesga），保证跨包混用不花
- **视角**：俯视（top-down）与灰盒经营层一致
- **角色**：六族各一套 walk/idle/work sheet；鹰族巨翼与矮小体型、鱼族鳍膜为必画差异点（见 GDD §5 appearance）
- **UI**：先继续 DOM 灰盒 UI（信息密度高），M3 再考虑像素 UI 皮肤

## 已知缺口（需自制或生成）

- 六族兽人角色（现有免费包几乎全是人类/奇幻人类）
- 大世界地图符号（山脉折线、河流、湖泊的极简像素图标）
- 见识卡配图（历史场景插画，像素风 16:9 小图）

缺口处理顺序：comfyui-agent 生成草稿 → 人工筛选/修图 → 仍不足再找像素画技能。
