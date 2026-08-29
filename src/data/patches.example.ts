// 示例补丁包（Tier 2 演示）：不改源文件即可调整官方内容
// 新插件补丁照此格式写在独立文件，并在 index.ts 的补丁清单挂载
import type { ContentPatch } from '../core/patches'

export const EXAMPLE_PATCHES: ContentPatch[] = [
  {
    pack: 'example-tuning',
    target: 'recipe',
    id: 'crudeAxe',
    ops: [{ op: 'rename', path: '', value: '打制砍砸器（工坊改良）' }],
  },
]
