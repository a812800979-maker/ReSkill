# ReSkill Development Plan

## Phase Overview

| Phase | Scope | Duration | Deliverable |
|-------|-------|----------|-------------|
| P0 | 项目规范与脚手架 | Day 1 | Spec文档 + 项目骨架 + CI |
| P1 | 前端核心页面 | Day 2-3 | 官网 + 工作台 + Skill编辑器 |
| P2 | 后端API + 录制 | Day 4-5 | API服务 + 屏幕捕获 + 实时观察 |
| P3 | Skill生成与执行 | Day 6-7 | Skill引擎 + Computer Use回放 |
| P4 | 联调与部署 | Day 8 | 端到端测试 + 部署上线 |

---

## P0: 项目规范与脚手架

### Tasks
- [x] 撰写 SKILL_SPEC.md（SKILL规范文档）
- [x] 撰写 ARCHITECTURE.md（架构文档）
- [x] 撰写 DEVELOPMENT_PLAN.md（开发计划）
- [ ] 创建示例 SKILL 文件（竞品分析 + 工单答疑）
- [ ] 初始化 Next.js 项目（App Router + Tailwind + TypeScript）
- [ ] 初始化 Fastify 后端项目（TypeScript + ESLint）
- [ ] 配置 Supabase 项目（数据库 + Auth）
- [ ] 配置环境变量与 .env 模板
- [ ] 编写 CLAUDE.md 项目指令文件

### Key Files
```
reskill/
├── SPEC/
│   ├── SKILL_SPEC.md
│   ├── ARCHITECTURE.md
│   └── DEVELOPMENT_PLAN.md
├── skills/
│   ├── competitive-analysis.md
│   └── ticket-auto-reply.md
├── web/                       # Next.js frontend
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── package.json
├── server/                    # Fastify backend
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── engines/
│   │   └── index.ts
│   └── package.json
├── CLAUDE.md
├── .env.example
└── README.md
```

---

## P1: 前端核心页面

### Tasks
- [ ] 官网落地页（Landing Page）
  - Hero区：产品名 + Slogan + CTA
  - 工作原理区：录制→生成→复用
  - 功能特性区
- [ ] 工作台页面（Workspace）
  - 三栏布局：左侧录制历史 / 中间对话流 / 右侧观察+轨迹双Tab
  - 录制控制：开始/暂停/停止/生成按钮状态机
  - 案例卡片：竞品分析 + 工单答疑
  - 屏幕捕获：getDisplayMedia() 集成
- [ ] Skill 编辑页面
  - 名称编辑
  - SKILL.md textarea 编辑
  - 可调参数增删改
  - 下载 / 验证执行
- [ ] 验证执行流程
  - Skill pill 在输入框
  - 参数输入弹窗
  - 执行进度实时展示
  - 报告生成预览
- [ ] 通用组件
  - ChatMessage / ChatInput
  - TrajectoryStep / ObservationItem
  - VideoPreview / ParamInput
  - ExecProgress / ReportPreview

---

## P2: 后端API + 录制

### Tasks
- [ ] API 路由实现
  - POST /api/sessions
  - POST /api/sessions/:id/record
  - POST /api/sessions/:id/stop
  - POST /api/sessions/:id/frames
  - POST /api/sessions/:id/events
- [ ] WebSocket 实时通信
  - observation:new 推送
  - trajectory:step 推送
  - 执行进度推送
- [ ] 屏幕录制捕获（Client-side）
  - getDisplayMedia() 授权与录制
  - MediaRecorder 视频录制
  - Canvas 截帧提取
  - DOM 事件捕获（click/keydown/scroll/navigation）
- [ ] Claude 实时观察（Backend）
  - 帧图片发送至 Claude Sonnet
  - 解析观察结果
  - 构建轨迹数据
  - 推送观察日志到前端
- [ ] 数据存储
  - Session / Recording 数据模型
  - 截图上传至 R2
  - 视频上传至 R2

---

## P3: Skill生成与执行

### Tasks
- [ ] Skill 生成引擎
  - 轨迹数据 → Claude Opus → SKILL.md
  - SKILL.md 解析器（YAML frontmatter + Markdown body）
  - SKILL.md 验证器（必填字段、变量引用、步骤ID唯一性）
  - 参数提取与类型推断
- [ ] Skill 编辑 API
  - PUT /api/skills/:id（更新SKILL.md内容）
  - PUT /api/skills/:id/params（更新参数定义）
  - POST /api/skills/:id/validate（验证输入参数）
- [ ] Skill 执行引擎
  - 解析 SKILL.md 步骤为执行计划
  - 步骤类型→Computer Use API 调用映射
  - 顺序执行循环（含条件判断、错误处理）
  - 变量上下文管理（inputs + variables + step outputs）
  - 实时截图与进度推送
- [ ] Computer Use 集成
  - Claude Sonnet + computer_20250124 工具
  - 截图→分析→操作循环
  - 等待与重试机制
  - 人工接管支持
- [ ] 报告生成
  - 执行完成后 Claude Opus 生成分析报告
  - 报告预览与下载

---

## P4: 联调与部署

### Tasks
- [ ] 端到端流程测试
  - 录制→生成→编辑→执行 完整链路
  - 竞品分析场景
  - 工单答疑场景
- [ ] 错误处理与边界测试
  - 录制中断恢复
  - 执行失败重试
  - 参数缺失校验
  - 网络异常处理
- [ ] 前端部署（Vercel）
  - Next.js 生产构建
  - 环境变量配置
  - 域名绑定
- [ ] 后端部署（Fly.io）
  - Docker 容器化
  - 环境变量配置
  - 健康检查与监控
- [ ] 数据库迁移（Supabase）
  - 生产环境 Schema
  - Row Level Security 策略
- [ ] 正式上线

---

## 关键技术决策记录

| 决策 | 选择 | 替代方案 | 理由 |
|------|------|---------|------|
| 录制方式 | getDisplayMedia() | 浏览器插件 | MVP无需安装插件，可录全屏 |
| 观察模型 | Claude Sonnet | Opus | 实时性优先，成本可控 |
| 生成模型 | Claude Opus | Sonnet | 质量优先，生成频率低 |
| 执行模型 | Claude Sonnet + Computer Use | Opus | 响应速度优先 |
| 前端框架 | Next.js 14 App Router | Remix, Vite | SSR + 文件路由 + 生态成熟 |
| 后端框架 | Fastify | Express, Hono | 性能优 + TS原生 + WebSocket |
| 数据库 | Supabase (PostgreSQL) | PlanetScale, Neon | Auth内置 + RLS + 免费额度 |
| 对象存储 | Cloudflare R2 | AWS S3 | 无出口费 + S3兼容 |
| 前端部署 | Vercel | Cloudflare Pages | Next.js原生支持 |
| 后端部署 | Fly.io | Railway, Render | 容器化 + 全球边缘 |
