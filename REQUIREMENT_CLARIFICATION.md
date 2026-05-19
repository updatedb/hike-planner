# 需求澄清记录 — hike-planner

**澄清日期**: 2026-05-19
**项目类型**: 研发需求

## 1. 目的
为普通旅行者（徒步爱好者）生成完整出行方案，涵盖大交通、酒店、徒步路线、路线人文介绍。

## 2. 服务对象

### 产品用户
- 普通旅行者（非专业徒步人群）
- 使用形态：OpenClaw Skill（在 OpenClaw 中调用，发布到 ClawHub）

### 项目管理人员
- 强哥（私人项目，自主决策）

### 领导/汇报对象
- 无（私人项目，无需对外汇报）

## 3. 输出物
- [ ] 可安装的 Skill 包（含 `SKILL.md` + 运行脚本 + 参考模板）
- [ ] 行程规划 SOP（参考 `travel/self-improving/domains/travel-agent-sop.md`）
- [ ] 行程计划模板（参考 `travel/trip/upcoming/PLAN_TEMPLATE.md`）
- [ ] MRD.md + PRD.md（按研发需求流程）

## 4. 评价标准

### 对产品用户（普通旅行者）
| 指标 | 目标 | 度量 |
|------|------|------|
| 行程完整性 | 覆盖大交通+酒店+路线+人文 | 输出包含所有必要章节 |
| 信息准确性 | 事实类信息可验证 | 12306 查票、高德校验距离、Wikipedia 来源 |
| 内容丰富度 | 人文介绍有趣有据 | 含诗词、历史、美食等 |
| 流程合规性 | 遵循 SOP 六步流程 | 收集需求→锁大交通→顺排→倒排→小交通→填补 |

### 对项目管理人员（强哥）
| 指标 | 目标 | 度量 |
|------|------|------|
| Skill 可发布性 | 可通过 ClawHub 安装 | 符合 OpenClaw Skill 编写规范 |
| 模板标准化 | 与现有 Travel Agent SOP 一致 | 对比 `travel-agent-sop.md` 检查 |

### 输出物质量对标
- **工作流参考**: `~/travel/self-improving/domains/travel-agent-sop.md`
- **模板参考**: `~/travel/trip/upcoming/PLAN_TEMPLATE.md`
- **输出参考**: `~/travel/trip/completed/gushudao-2026-05/README.md`

## 5. 工作范围
- **需要开发**: 是（Skill 脚本编写）
- **需要测试**: 是
- **依赖 Skill**: `12306-train-assistant`（火车票）、`amap-lbs-skill`（距离/路线）、`flyai`（机票/酒店）
- **保底策略**: 依赖项不可用时需有降级方案（如 web_search 替代、手动输入等）
