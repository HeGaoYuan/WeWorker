import { slugify } from './sitesHeadings.js'

/** wecli 文档 TOC：仅命令行操作说明 */
export const WECLI_GROUPS = [
  {
    name: '命令行操作',
    sites: [
      '使用前准备',
      '基本调用格式',
      '发现有哪些工具',
      '推荐调用流程',
      '参数与占位符',
      '常用辅助命令',
      '常见问题',
      '和「试试说」怎么配合',
    ],
  },
]

export function getWecliHeadings(groups = WECLI_GROUPS) {
  const headings = []
  for (const group of groups) {
    headings.push({ level: 2, text: group.name, id: slugify(group.name) })
    for (const site of group.sites) {
      headings.push({ level: 3, text: site, id: slugify(site) })
    }
  }
  return headings
}
