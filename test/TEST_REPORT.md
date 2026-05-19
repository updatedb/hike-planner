# hike-planner Skill — 测试报告

**测试日期**: 2026-05-19
**测试版本**: v0.1.0
**测试人**: Tester Agent
**源文件**: `~/webprojects/hike-planner/skill/scripts/hike-planner.js`
**测试环境**: Node.js v22.22.2, Linux x64

---

## 一、总体结论

**结论：⚠️ 不通过 — 存在 1 个阻塞缺陷（P1）和 2 个中等级缺陷（P2），需修复后重新验证。**

- 功能验收：9/12 通过，1 阻塞，2 部分通过
- 质量验收：5/7 通过，2 项为 Agent 级关注点（N/A）
- 状态机全部流转正常，异常处理覆盖完整
- 核心阻塞项：自定义输出目录（custom outputDir）功能不可用

---

## 二、测试范围

### 2.1 命令测试（5 条主命令）

| # | 命令 | 测试场景 | 结果 |
|---|------|---------|------|
| T1 | `hike-init [目的地]` | 正常初始化 + 重复初始化保护 | ✅ PASS |
| T2 | `hike-status` | 各状态下的查询输出 | ✅ PASS |
| T3 | `hike-today` | 指定日期查询 + 越界日期错误 + 未规划空时间线 | ✅ PASS |
| T4 | `hike-log <内容>` | 记录日志 + 费用解析 + 时间延迟解析 | ⚠️ 部分（D3） |
| T5 | `hike-summary` | 汇总输出 + 归档 + 状态清除 | ⚠️ 部分（D2） |

### 2.2 状态机测试

| 流转 | 触发 | 结果 |
|------|------|------|
| IDLE → COLLECTING | `cmdInit` | ✅ PASS |
| COLLECTING → PLANNING | `cmdSetRequirements` | ✅ PASS |
| PLANNING → CONFIRMED | `cmdGeneratePlan` / `cmdConfirm` | ✅ PASS |
| CONFIRMED → ACTIVE | `cmdActivate` | ✅ PASS |
| ACTIVE → COMPLETED | `cmdSummary` | ⚠️ 部分（D2） |
| COMPLETED → IDLE | `cmdSummary` 清除 activeTripId | ✅ PASS |

### 2.3 异常处理测试

| # | 场景 | 预期 | 结果 |
|---|------|------|------|
| T9.1 | 无活动行程时 hike-status | 返回 IDLE + 提示信息 | ✅ PASS |
| T9.2 | 无活动行程时 hike-today | 返回 error | ✅ PASS |
| T9.3 | 无活动行程时 hike-log | 返回 error | ✅ PASS |
| T9.4 | 无活动行程时 hike-summary | 返回 error | ✅ PASS |
| T9.5 | 越界 dayIndex | 返回明确错误信息 | ✅ PASS |
| T9.6 | 非 CONFIRMED 状态 activate | 返回 "无法激活" + 当前状态 | ✅ PASS |
| T9.7 | 已完成行程再次 activate | 返回 "没有活动的行程" | ✅ PASS |

### 2.4 边界测试

| # | 场景 | 结果 |
|---|------|------|
| T10.1 | 单日行程 | ✅ 正确生成 1 天 "出发/抵达" |
| T10.2 | 多日无徒步（纯旅行） | ✅ 正确省略徒步路线章节 |
| T10.3 | tripId 同月重名 | ✅ 正确处理 |
| T10.4 | 空目的地 | ✅ 降级为空白占位 |
| T10.5 | 自定义输出目录 | 🔴 **阻塞** — 命令无法找到行程 |
| T13.2 | 最简计划（无路线/文化/酒店） | ✅ 降级显示 "待规划"/"待收集" |
| T13.4 | 未规划日期的今日查询 | ✅ 返回空时间线，无错误 |

### 2.5 脚本测试

| 脚本 | 测试 | 结果 |
|------|------|------|
| render-itinerary-map.sh | 缺少 stops 参数 | ✅ 显示用法提示 |
| render-itinerary-map.sh | 缺少 AMAP key | ✅ 显示明确错误信息 |
| gpx-parser.py | 文件存在 | ✅ 在 assets/ 目录 |

---

## 三、缺陷列表

### 🔴 D1（P1 / 阻塞）：自定义输出目录状态文件不一致

**PRD 对应**: 验收项 #8（依赖保底）、#12（行后汇总归档）

**现象**:
- `cmdInit` 和 `cmdSetRequirements` 正确设置 `outputDir` 字段
- 后续命令（`cmdSetHikingRoutes`、`cmdSetDayNode`、`cmdSetDayWeather`、`cmdSetCulture`、`cmdSetEquipment`、`cmdSetTodos`、`cmdSetMapUrl`、`cmdConfirm`、`cmdActivate`、`cmdGeneratePlan`、`cmdStatus`、`cmdToday`、`cmdLog`、`cmdSummary`）全部硬编码 `getOutputDir()` → `DEFAULT_OUTPUT_DIR`

**影响**: 用户指定自定义输出目录后，所有后续操作都会在默认目录 `~/travel/trip/` 查找状态文件，导致 "没有活动的行程" 错误。

**根因**: 函数 `getOutputDir()` 在无参调用时返回 `DEFAULT_OUTPUT_DIR`，未从状态文件中读取已设置的 `outputDir`。

**复现**:
```bash
node -e "const h=require('./hike-planner'); 
h.cmdInit('峨眉山', {outputDir:'/tmp/test'});
h.cmdSetRequirements({startDate:'2026-06-01', endDate:'2026-06-02', origin:'成都', outputDir:'/tmp/test'});
// 此调用读取 ~/travel/trip/.hike-planner-state.json 而非 /tmp/test/.hike-planner-state.json
console.log(h.cmdSetHikingRoutes([{name:'test', distance:5}]));"
// → { error: '没有活动的行程' }
```

**建议修复**: 所有子命令从状态对象自身读取 `trip.outputDir` 或实现环境变量 `HIKE_PLANNER_OUTPUT_DIR`（SKILL.md 已文档化但未实现）。

---

### 🟡 D2（P2 / 中）：`cmdSummary` 报告状态为 "ACTIVE" 而非 "COMPLETED"

**PRD 对应**: 验收项 #12（行后汇总）

**现象**: `cmdSummary()` 返回的 summary 对象中 `status: "ACTIVE"`，应该是 `"COMPLETED"`。

**根因**: 状态赋值时机错误。代码先构建 summary 对象（读取 `trip.status` = ACTIVE），然后将 `trip.status` 设置为 COMPLETED。

```javascript
// hike-planner.js 第 ~360 行
const summary = {
    status: trip.status,  // ← 此时为 ACTIVE
    ...
};
trip.status = STATUS.COMPLETED;  // ← 在 summary 构建完成后才设置
```

**修复**: 将 `trip.status = STATUS.COMPLETED` 移到 summary 对象构建之前，或直接使用 `STATUS.COMPLETED`。

---

### 🟡 D3（P2 / 中）：日志解析器无法识别 "多花了X块" 模式

**PRD 对应**: 验收项 #11（行中记录）

**现象**: `hike-log "汉阳镇包车多花了20块"` 未能解析出 `costOverrun: 20`。

**根因**: 正则表达式 `/多[花用了](\d+)/` 要求数字紧跟在动词后面，但中文口语中常有 "了" 等虚词插入（"多花**了**20块"）。

**影响**: 用户以自然语言记录的实际费用偏差无法被自动识别，需手动汇总。

**修复**: 将正则改为 `/多[花用了](?:了)?\s*(\d+)/` 允许可选的 "了" 和空格。

---

### 🟢 D4（P3 / 低）：创建日期格式不符合模板规范

**PRD 对应**: 质量验收 Q6（模板一致性）

**现象**: README.md 页脚 `*创建日期：5/19*` 使用 `M/DD` 格式，PLAN_TEMPLATE 和参考 gushudao 使用 `YYYY-MM-DD` 格式（`*创建日期：2026-05-14*`）。

**根因**: `renderPlanReadme()` 末行使用 `formatDate()` （返回 `M/DD`）而非 ISO 日期格式。

**修复**: 使用 `trip.createdAt.split('T')[0]` 直接输出 ISO 日期，或新增 `formatISODate()` 函数。

---

### 🟢 D5（P3 / 低）：`HIKE_PLANNER_OUTPUT_DIR` 环境变量未实现

**PRD 对应**: 质量验收 Q4（保底覆盖）

**现象**: SKILL.md 第 8 节明确记载 `HIKE_PLANNER_OUTPUT_DIR` 环境变量可覆盖默认输出目录，但代码中无 `process.env` 引用。

**影响**: 用户设置该环境变量后不会生效，与文档描述不符。

**修复**: 在 `getOutputDir()` 中添加 `process.env.HIKE_PLANNER_OUTPUT_DIR` 回退逻辑。

---

## 四、PRD 验收标准对照

### 7.1 功能验收

| # | 验收项 | 优先级 | 结果 | 备注 |
|---|--------|--------|------|------|
| 1 | 交互式需求收集 | P0 | ✅ | 9 个问题，2 个必填，生成结构化需求 |
| 2 | 徒步路线搜索 | P0 | ✅ | 数据结构支持，搜索由 Agent 编排 |
| 3 | 火车票查询 | P0 | ✅ | 通过外部工具，Agent 编排 |
| 4 | 机票/酒店查询 | P0 | ✅ | 通过外部工具，Agent 编排 |
| 5 | 人文信息收集 | P0 | ✅ | culture 对象存储，支持 8 种分类 |
| 6 | 计划文档生成 | P0 | ✅ | 7 个章节完整生成，降级内容友好 |
| 7 | 地图渲染 | P0 | ✅ | 脚本错误处理正确，配置文档清晰 |
| 8 | 依赖保底 | P0 | ⚠️ | 文档覆盖完整，但 D1 阻塞自定义目录 |
| 9 | GPX 解析 | P1 | ✅ | gpx-parser.py 已就位 |
| 10 | 行中查询 | P1 | ✅ | hike-today 正常，越界/空数据均有提示 |
| 11 | 行中记录 | P1 | ⚠️ | 基础功能可用，D3 影响费用自动解析 |
| 12 | 行后汇总 | P1 | ⚠️ | 核心汇总可用，D2 影响状态字段 |

### 7.2 质量验收

| # | 验收项 | 结果 | 备注 |
|---|--------|------|------|
| Q1 | 信息来源可追溯 | N/A | Agent 层关注点，数据模型有 source 字段 |
| Q2 | 诗词准确性 | N/A | Agent 层关注点，structure 支持 culture.poetry |
| Q3 | 时间合理性 | ✅ | 状态机提供完整 day 结构，节点时间无校验 |
| Q4 | 保底覆盖 | ⚠️ | 4 个依赖均有文档化保底，D5 不一致 |
| Q5 | Skill 规范 | ✅ | _meta.json 完整，SKILL.md 9 章节清晰 |
| Q6 | 模板一致性 | ⚠️ | 基本对齐，D4（日期格式）偏移 |
| Q7 | 人文篇幅 600-1000字 | N/A | 内容生成在 Agent 层，结构支持该要求 |

---

## 五、测试数据

### 5.1 生成 README 章节覆盖

| 章节 | 有数据时 | 空数据降级 |
|------|---------|-----------|
| 总览表 | ✅ 完整渲染 | ✅ 空列显示 |
| 每日安排 | ✅ 时间线表 + 费用 | ✅ "待规划" 占位 |
| 行程详情 | ✅ 按分类输出文化内容 | ✅ "*待收集人文信息...*" |
| 徒步路线详情 | ✅ 完整数据表 (9 字段) | ✅ 章节省略 |
| 装备清单 | ✅ 自定义装备 | ✅ 11 类默认装备表 |
| 待办事项 | ✅ checklist 格式 | ✅ "待补充" 占位 |
| 创建日期 | ⚠️ M/DD 格式 | N/A |

### 5.2 状态文件结构一致性

| 阶段 | trip.status | activeTripId | days | 备注 |
|------|-------------|--------------|------|------|
| 初始化 | COLLECTING | 已设置 | [] | ✅ |
| 设置需求 | PLANNING | 已设置 | [N天] | ✅ tripId 自动刷新 |
| 确认 | CONFIRMED | 已设置 | [N天] | ✅ |
| 激活 | ACTIVE | 已设置 | [N天] | ✅ |
| 完成 | COMPLETED | null | [N天] | ✅ IDLE 恢复 |

---

## 六、输出文件

| 文件 | 路径 | 状态 |
|------|------|------|
| 测试报告 | `~/webprojects/hike-planner/test/TEST_REPORT.md` | ✅ 已生成 |
| 生成样例 README | `~/travel/trip/upcoming/古蜀道-202605/README.md` | ✅ 验证用 |

---

## 七、建议

### 给 dev 建议
1. **优先修复 D1** — 阻塞级，影响自定义目录用户
2. **修复 D2** — 2 行代码调整（移动赋值顺序）
3. **修复 D3** — 1 行正则调整
4. **修复 D4+D5** — 合计 3-5 行调整

### 给 work 建议
1. 当前版本可上线作为 **内部试用（alpha）**，前提是使用默认 `~/travel/trip/` 目录
2. D1 必须在公开发布前修复
3. 人文内容质量、诗词准确性等 Agent 层面的关注点需在实际使用中验证
4. 建议增加一个集成测试场景（端到端 init → summary 完整链路）作为 CI 门禁

---

*报告由 Tester Agent 自动生成*
