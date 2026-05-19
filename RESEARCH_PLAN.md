# 研究计划 — hike-planner

**创建日期**: 2026-05-19

## 待研究主题

| # | 主题 | 关键问题 | 方法 | 状态 |
|---|------|---------|------|------|
| 1 | OpenClaw Skill 编写规范 | SKILL.md 格式、脚本约定、目录结构 | 已查阅 `skill-creator` + `debate-arena` | ✅ 已完成 |
| 2 | 依赖 Skill 能力边界 | 12306/amap/flyai 的接口、保底方案 | 已查阅各 skill 位置和能力 | ✅ 已完成 |
| 3 | Travel Agent SOP 可迁移性 | SOP 哪些逻辑直接复用？哪些需重构？ | 对照 SOP 逐条分析 | ✅ 已完成 |
| 4 | Skill 架构设计 | 主流程、命令设计、保底策略 | 基于研究结论分析 | ✅ 已完成 |
| 5 | 信息源扩展 | 小红书/Wikipedia/web_search 接入策略 | 用户确认 | ✅ 已完成 |

## 研究结论

### 1. Skill 结构（参考 debate-arena）
```
hike-planner/
├── SKILL.md           — 主命令定义 + 流程说明
├── _meta.json         — slug/version（发布用）
├── scripts/           — 核心脚本（行程生成等）
├── references/        — 模板文件、SOP 参考
└── assets/            — 输出模板
```

### 2. 依赖项能力与保底策略

| 依赖 | 可用性 | 保底方案 |
|------|--------|---------|
| `12306-train-assistant` | 自定义脚本 `~/travel/skills/12306-train-assistant/client.py` | 允许用户手动输入火车票信息 |
| `amap-lbs-skill` | 标准 Skill，需 `AMAP_WEBSERVICE_KEY` | 用户手动输入距离/坐标 |
| `flyai` | npm CLI `@fly-ai/flyai-cli` | web_search 搜索机票/酒店 |
| `web_search` | 始终可用 | — |
| `xiaohongshu__search_feeds` | 需登录 | web_search 替代 |

### 3. Travel Agent SOP 核心流程映射

| SOP 步骤 | hike-planner 处理方式 |
|----------|---------------------|
| 收集需求 | Skill 启动时交互式询问用户 |
| 搜索路线 | route-search（扩展为通用徒步路线搜索）+ 小红书攻略 |
| 锁定大交通 | 调用 12306 或 flyai，失败则手动输入 |
| 起点顺排 | 脚本逻辑计算时间线 |
| 终点倒排 | 脚本逻辑反推 |
| 安排小交通 | amap-lbs-skill 或手动 |
| 填补日常安排 | 模板自动生成 |
| 生成行程地图 | amap-lbs-skill 地图渲染 |
| 人文介绍 | Wikipedia + 小红书 + web_search 多渠道 |

### 4. 三阶段功能覆盖

| 阶段 | 功能 | 说明 |
|------|------|------|
| **行前规划** | 生成计划、订票、酒店、导入GPX | 大交通+酒店+路线+人文 |
| **行中执行** | 查询每日计划、记录实际费用/时间/路线 | 实时追踪与对比 |
| **行后汇总** | 汇总费用、时间、路线 | 归档到 completed 目录 |

## 待查证事实

| # | 事实声明 | 查证方式 | 结果 |
|---|---------|---------|------|
| 1 | ClawHub 发布需要 `_meta.json`（含 slug/version） | 已查 debate-arena | ✅ slug+version+ownerId |
| 2 | Skill 脚本语言不限，node/python 均可 | 已查 skill-creator | ✅ 只需在 SKILL.md 中说明 |
| 3 | 信息源：小红书攻略 + Wikipedia + web_search | 用户确认 | ✅ 多渠道互补 |
