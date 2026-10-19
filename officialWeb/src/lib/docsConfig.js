import { ADAPTER_REPO, GITHUB_REPO } from './siteConfig.js'

/** 对外文档侧栏：去掉内网-only 链接 */
export const DOCS_SIDEBAR = [
  {
    group: '入门',
    items: [
      { slug: 'introduction', title: '什么是 WeWorker' },
      { slug: 'quick-start', title: '快速开始' },
    ],
  },
  {
    group: '核心功能',
    items: [
      { slug: 'supported-sites', title: '适配网站' },
      { slug: 'skills', title: 'Skill 安装与使用' },
      { slug: 'wecli', title: 'webcli 操作说明' },
      { slug: 'scheduled-tasks', title: '定时任务' },
      { slug: 'channels', title: '消息通道' },
    ],
  },
  {
    group: '参考',
    items: [
      { slug: 'settings', title: '设置与配置' },
      { slug: 'adapters', title: 'Adapter 开发' },
    ],
  },
  {
    group: '源码',
    items: [
      { title: 'WeWorker 仓库', href: GITHUB_REPO },
      { title: 'Adapter 目录', href: ADAPTER_REPO },
    ],
  },
]
