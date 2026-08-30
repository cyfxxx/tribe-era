# 部落纪元 · 美术管线记录（真实世界地图像素化）

> 状态：地图 A 海图风 v4 已出（2026-08-30 P0 雪区重做）；B 古籍风同步升级为备选；
> 人物/物品候选被否，搁置等重做。本文档供任意上下文续跑/续研，无需重新考古。

## 决策记录
- 2026-08-30 用户选 **地图 A（海图风）v3**；B 古籍风保留为备选
- 2026-08-30 **P0 雪区重做（v4）**：格陵兰冰盖分层/南极极点补全/高山雪线灰白掺岩/
  低纬雪线 28° 压制/网格 0.18→0.10——用户换模型看图后指出三处白块问题全部修复
- 真实世界地图像素化路线确定（现成像素世界地图不存在；Natural Earth public domain）
- 人物/物品（3 画风×6 种族/8 物品 sheet）不合格，弃用待新方案；用户会换模型优化

## 数据源
- Natural Earth 110m 海岸线：`https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json`（public domain，无需署名；缓存 /tmp/land-110m.json）
- 无高程/气候真实数据——地形由程序规则生成（山系点位表+噪声）

## 管线（可复跑）
```bash
node tools/art/make-worldmap.mjs        # 地图：下载→解码→光栅化→地形→渲染 A/B 两风格 PNG
node tools/art/make-sprites.mjs         # 人物/物品候选 sheet（已弃用方案，保留作参考）
npx vite build                          # public/art-preview → dist/
cp -r public/art-preview public/art-gallery.html dist/   # 静态服务直接用 public 即可，此步对 github pages 部署才需要
```
- 输出：`public/art-preview/map-a-ocean.png`（960×480），选择页 `public/art-gallery.html`
- 本地预览：http://127.0.0.1:5173/art-gallery.html（tmux 会话 pi-tribe-static 服务 dist/）

## 关键参数位置（tools/art/make-worldmap.mjs）
| 参数 | 位置 | 说明 |
|---|---|---|
| W/H/LW/LH | 顶部 | 960×480 成品，240×120 逻辑格（2×2 像素簇） |
| RANGES | genTerrain | 19 条山系 [lon,lat,r,权重]（喜马拉雅 0.52/安第斯三段/天山…） |
| DESERTS / JUNGLES / OASES | genTerrain | 沙漠/雨林/绿洲湿度修正点 |
| hum 公式 | genTerrain | `(1-seaDist)*0.6 + fbm*0.34 - 0.1`，seaDist=陆地距海距离/9px（≈380km） |
| hei 公式 | genTerrain | fbm 0.72/0.28 混合 + 山系叠加，基线重映射 (hei-0.34)/0.62 |
| biomeOf | genTerrain | 纬度湿度阈值 → 9 类 biome（点位自检依据） |
| PALETTES.ocean/parchment | 渲染 | v4 色板：sea 四层 + land/hill/mount/snow + 9 气候色 + ice/iceDeep（冰架亮白→内陆蓝灰） |
| 海拔分层 | 渲染 | hei>0.26→hill、>0.46→mount、>0.66→snow 连续混合；**低纬 |lat|<28 上限用 mount 棕**（防横断山等低纬高山染白） |
| 低纬雪线压制 | 渲染 | `bm==='snow' && |lat|<28 → rock`（2026-08-30 由 26 提高：26N 横断山孤立白雪点） |
| 冰雪特化 | 渲染 | snow biome：|lat|>60（格陵兰/南极/北极圈山地）=冰盖分支（dLand/20 近海冰架→内陆 iceDeep + 噪声杂色）；|lat|<60=高山雪线（ice 掺 rock ≤0.55 灰白） |
| 南极极点补全 | patchAntarctic | world-atlas 110m 南极洲南界仅 -88° 且 -84° 以下有洞；lat<-84.5° 全部标陆地（y≥466，+2.8% 陆地） |
| 海洋分层 | 渲染 | d/13：<0.18 浅滩 shoal、<1 sea、≥1 深渊 seaAbyss |
| 海岸处理 | 渲染 | 临海整格 ×0.88 暗化（勿改回整格提亮——小岛会大面积高亮） |
| 经纬网格 | 渲染 | 间隔 80/96px，混合 0.10（2026-08-30 由 0.18 降：0.18 深海上过显/陆地上隐形） |

## 无图环境质检手段（模型不能看图的替代验证，均已在脚本内）
1. `biome 占比`（陆地气候分布）与 `hum 直方图`（DEBUG=1 输出，目标内陆 0-0.3 为主）
2. **18 真实地理点位逐格自检**：撒哈拉→desert、亚马逊→jungle、西伯利亚→taiga/tundra、南极→snow、两河→steppe（脚本自动打印）
3. 陆地占比 **≈32.0%** 验证海岸线（真实值 29.2% + 南极极点补全 2.8%——110m 数据南极缺失 -88° 以南）
4. 小岛亮度统计（小岛≤12px 平均亮度 ~126，>200 需排查）——针对"高亮突兀"问题
5. 色板直方图：检查分层是否拉开（v3：深渊 17.8%/雪线 6.1%）

## 待优化项（按优先级）
- **B 古籍风海洋色偏脏**（灰褐泥水感）——备选版，用户若回头选再调
- 等距圆柱高纬视觉放大（西伯利亚苔原/南极偏大）——可选罗宾逊投影（重写投影层）
- rock 占比 0.6% 偏少（山核可扩）；desert/steppe 视觉占比低于真实
- shaded relief（山体阴影）可选增强，数据需 SRTM/GEBCO 高程（下载可达性未验证）
- 20-30 个物品像素图标 + 人物 sprites 需重做（被否版参考 tools/art/make-sprites.mjs）
- 游戏内接入：真实世界多边形替换 src/core/world.ts 虚构 polygon；区域按真实位置重排；三级层（世界/大洲/地形区）待实施

## 关联
- docs/UI-DESIGN.md：UI/地图设计指南与差距清单
- /root/.pi/packs/gamedev/EXPERIENCE.md：2026-08-30 条目（管线/教训/QA 经验）