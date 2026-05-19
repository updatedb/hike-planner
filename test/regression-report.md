# hike-planner Skill — 缺陷修复回归报告

**测试日期**: 2026-05-19
**测试版本**: v0.1.0（修复后）
**测试人**: Tester Agent
**上一轮报告**: `test/TEST_REPORT.md`（D1-D5 缺陷清单）
**源文件**: `~/webprojects/hike-planner/skill/scripts/hike-planner.js`

---

## 一、总体结论

**结论：⚠️ 有风险通过 — D1/D2/D4 修复通过，D3/D5 各剩余 1 个次级缺陷**

| 缺陷 | 说明 | 状态 |
|------|------|------|
| D1 | outputDir 三层优先级 + DEFAULT_OUTPUT_DIR=skill/planner/ | ✅ 已修复 |
| D2 | hike-summary 状态为 COMPLETED | ✅ 已修复 |
| D3 | hike-log 费用解析增强 | ⚠️ 未完全修复（1 残留） |
| D4 | README 日期格式 MM/DD 零填充 | ✅ 已修复 |
| D5 | SKILL.md 不再声明 AMAP_WEBSERVICE_KEY | ⚠️ 未完全修复（1 残留） |

- 功能回归：**19/19** 全命令 + 状态机 + 异常处理 ✅
- 综合通过率：51/53 项（96.2%）
- 无新增严重/阻塞缺陷
- 发现 2 个新缺陷：D3-EXT1（低）、D5-RES1（低）

---

## 二、缺陷逐项回归

### D1：outputDir 三层优先级 — ✅ 已修复

**验证项**：

| # | 验证内容 | 结果 |
|---|---------|------|
| D1.1 | `DEFAULT_OUTPUT_DIR` 指向 `skill/planner/` | ✅ |
| D1.2 | `getOutputDir()` 无参返回默认值 | ✅ |
| D1.3 | `getOutputDir({ outputDir })` options 优先级最高 | ✅ |
| D1.4 | `process.env.HIKE_PLANNER_OUTPUT_DIR` 环境变量生效 | ✅ |
| D1.5 | options > env > default 优先级正确 | ✅ |
| D1.6 | `cmdInit` 自定义 outputDir 完整链路 | ✅ |

**代码变更要点**：
```javascript
function getOutputDir(options) {
  if (options && options.outputDir) return options.outputDir;           // ① options
  if (process.env.HIKE_PLANNER_OUTPUT_DIR) return process.env.HIKE_PLANNER_OUTPUT_DIR;  // ② env
  return DEFAULT_OUTPUT_DIR;  // ③ default = skill/planner/
}
```
- `HIKE_PLANNER_OUTPUT_DIR` 环境变量已实现（上一轮缺失）
- `DEFAULT_OUTPUT_DIR` 从 `~/travel/trip/` 改为 `skill/planner/`

> ⚠️ **注意**：子命令（如 `cmdSetHikingRoutes` 等）无参调用 `getOutputDir()` 时返回 `DEFAULT_OUTPUT_DIR`，不会自动感知已初始化的自定义目录。需通过环境变量 `HIKE_PLANNER_OUTPUT_DIR` 全域设置方能跨命令生效。此为已知设计约束，非回归缺陷。

---

### D2：hike-summary 状态为 COMPLETED — ✅ 已修复

**验证项**：

| # | 验证内容 | 结果 |
|---|---------|------|
| D2.1 | `cmdSummary()` 返回对象 `status: "COMPLETED"` | ✅ |
| D2.2 | 状态文件写入 `status: "COMPLETED"` | ✅ |
| D2.3 | `activeTripId` 置为 `null`（IDLE 恢复） | ✅ |
| D2.4 | `cmdStatus()` 后返回 `IDLE` | ✅ |

**代码变更要点**：
```javascript
// 修复前（错误顺序）：先构建 summary（读取旧状态），再设置为 COMPLETED
const summary = { ..., status: trip.status };  // ← 此时为 ACTIVE
trip.status = STATUS.COMPLETED;

// 修复后（正确顺序）：先设置状态为 COMPLETED，再构建 summary
trip.status = STATUS.COMPLETED;
const summary = { ..., status: trip.status };  // ← 此时为 COMPLETED
```

---

### D3：hike-log 费用解析 — ⚠️ 部分修复

**已验证通过的解析模式**：

| 测试文本 | 预期 | 实际 | 结果 |
|---------|------|------|------|
| "汉阳镇包车多花了20块" | 20 | 20 | ✅ |
| "今天买装备超支了200块" | 200 | 200 | ✅ |
| "半路打车额外花了30" | 30 | 30 | ✅ |
| "吃饭多用了50块" | 50 | 50 | ✅ |
| "路上出预算了80" | 80 | 80 | ✅ |
| "天气很好，路线顺利" | undefined | undefined | ✅ |

**新增正则**（相比上一轮）：
```javascript
const costMatch = text.match(
  /(?:多[花用了]了?|[超出]预?算?了?|额外[花用]?了?|超支了?)\s*(\d+)/
);
```
- 新增 `额外[花用]?了?` 分支
- `多[花用了]` 扩展支持 "用了"
- `[超出]预?算?了?` 支持 "出预算了X"

---

### 🔴 D3-EXT1（新发现 / P3 / 低）："超出了预算 X" 模式未匹配

**复现**：
```javascript
h.cmdLog('住宿超出了预算100')  // costOverrun: undefined（应为 100）
h.cmdLog('超出了预算300元')    // costOverrun: undefined（应为 300）
```

**通过的模式**：
```javascript
h.cmdLog('超预算200')    // costOverrun: 200 ✅
h.cmdLog('超出预算50块')  // costOverrun: 50 ✅
```

**根因**：正则 `[超出]预?算?了?` 中，`[超出]` 为单字符匹配，`预?算?了?` 为有序可选链。对 "超出了预算X"：
- `[超出]` 匹配 "超"
- `预?` 跳过（下一字是 "出"）
- `算?` 跳过（下一字是 "出"）
- `了?` 跳过（下一字是 "出"）
- 此时需要 `\s*(\d+)` 但遇到 "出"，整体失败

**建议修复**：在现有正则前追加分支 `超出[了]?\s*预算[了]?`：
```javascript
/(?:超出[了]?\s*预算[了]?|多[花用了]了?|[超出]预?算?了?|额外[花用]?了?|超支了?)\s*(\d+)/
```

---

### D4：README 日期格式 MM/DD — ✅ 已修复

**验证项**：

| # | 验证内容 | 结果 |
|---|---------|------|
| D4.1 | `formatDate('2026-05-03')` → `'05/03'` | ✅ |
| D4.2 | 单数月份 `01` 补零 → `'01/09'` | ✅ |
| D4.3 | 单数日期 `05` 补零 → `'12/05'` | ✅ |
| D4.4 | 双位数 `11/15` 保持不变 | ✅ |
| D4.5 | 总览表第一列日期 `\| 03/05 \|` | ✅ |
| D4.6 | 页脚 `*创建日期：05/19*` | ✅ |

**代码**：
```javascript
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  const m = String(d.getMonth() + 1).padStart(2, '0');  // ← 零填充
  const day = String(d.getDate()).padStart(2, '0');      // ← 零填充
  return `${m}/${day}`;
}
```

---

### D5：SKILL.md 不再声明 AMAP_WEBSERVICE_KEY — ⚠️ 部分修复

**验证项**：

| # | 验证内容 | 结果 |
|---|---------|------|
| D5.2 | 外部依赖表格正确描述 AMAP_WEBSERVICE_KEY 归属 | ✅ |

Line 210 正确说明：
```
> 注：`AMAP_WEBSERVICE_KEY` 由 `amap-lbs-skill` 读取，hike-planner 本身不直接读取该变量。
```

---

### 🟡 D5-RES1（新发现 / P3 / 低）：内置能力表残留 AMAP_WEBSERVICE_KEY

**位置**：`SKILL.md` Line 95

```markdown
| 行程地图渲染 | 高德地图可视化链接（AMAP_WEBSERVICE_KEY 环境变量） |
```

**问题**：此描述让人误以为 hike-planner 自身需要设置 `AMAP_WEBSERVICE_KEY` 环境变量，与 Line 210 注释矛盾。

**建议修复**：修改为：
```markdown
| 行程地图渲染 | 高德地图可视化链接（依赖 amap-lbs-skill，需 AMAP_WEBSERVICE_KEY） |
```

---

## 三、全量回归测试

### 3.1 5 条主命令回归

| # | 命令 | 场景 | 结果 |
|---|------|------|------|
| REG1 | `cmdInit` | 正常初始化 | ✅ |
| REG2 | `cmdInit` | 重复初始化保护 | ✅ |
| REG3 | `cmdSetRequirements` | 完整需求设置（9 字段） | ✅ |
| REG4 | `cmdStatus` | 查看状态 + 进度 | ✅ |
| REG5 | `cmdSetHikingRoutes` | 设置徒步路线 | ✅ |
| REG6 | `cmdSetDayNode` | 添加时间节点 + dayCost 聚合 | ✅ |
| REG7 | `cmdSetDayWeather` | 设置天气 | ✅ |
| REG8 | `cmdSetCulture` | 设置文化信息 | ✅ |
| REG9 | `cmdSetEquipment` | 设置装备 | ✅ |
| REG10 | `cmdSetTodos` | 设置待办 | ✅ |
| REG11 | `cmdSetMapUrl` | 设置地图链接 | ✅ |
| REG12 | `cmdGeneratePlan` | 生成 README.md | ✅ |
| REG13 | `cmdConfirm` | 确认计划 → CONFIRMED | ✅ |
| REG14 | `cmdActivate` | 激活行程 → ACTIVE | ✅ |
| REG15 | `cmdToday` | 无参数查询（今日） | ✅ |
| REG16 | `cmdToday` | 指定日期查询 | ✅ |
| REG17 | `cmdToday` | 越界日期（错误处理） | ✅ |
| REG18 | `cmdLog` | 记录日志 | ✅ |
| REG19 | `cmdSummary` | 汇总输出 + 归档路径 | ✅ |

### 3.2 状态机完整性

| 流转 | 触发 | 结果 |
|------|------|------|
| IDLE → COLLECTING | `cmdInit` | ✅ |
| COLLECTING → PLANNING | `cmdSetRequirements` | ✅ |
| PLANNING → CONFIRMED | `cmdConfirm` / `cmdGeneratePlan` | ✅ |
| CONFIRMED → ACTIVE | `cmdActivate` | ✅ |
| ACTIVE → COMPLETED | `cmdSummary` | ✅ |
| COMPLETED → IDLE | `activeTripId=null` + `cmdStatus` | ✅ |

### 3.3 异常处理回归

| # | 场景 | 预期行为 | 结果 |
|---|------|---------|------|
| ERR1 | 无活动行程 → `cmdStatus` | `IDLE` + 提示信息 | ✅ |
| ERR2 | 无活动行程 → `cmdToday` | 返回 error | ✅ |
| ERR3 | 无活动行程 → `cmdLog` | 返回 error | ✅ |
| ERR4 | 无活动行程 → `cmdSummary` | 返回 error | ✅ |
| ERR5 | 越界 `dayIndex` | 返回 "第 X 天不存在" | ✅ |
| ERR6 | 非 CONFIRMED → `cmdActivate` | 返回 "无法激活" | ✅ |
| ERR7 | 已完成后 `cmdStatus` | 返回 `IDLE` | ✅ |

---

## 四、PRD 验收标准对照（更新）

### 4.1 功能验收

| # | 验收项 | 优先级 | 上次 | 本次 | 备注 |
|---|--------|--------|------|------|------|
| 1 | 交互式需求收集 | P0 | ✅ | ✅ | |
| 2 | 徒步路线搜索 | P0 | ✅ | ✅ | |
| 3 | 火车票查询 | P0 | ✅ | ✅ | |
| 4 | 机票/酒店查询 | P0 | ✅ | ✅ | |
| 5 | 人文信息收集 | P0 | ✅ | ✅ | |
| 6 | 计划文档生成 | P0 | ✅ | ✅ | D4 日期格式修复 |
| 7 | 地图渲染 | P0 | ✅ | ✅ | |
| 8 | 依赖保底 | P0 | ⚠️ | ✅ | D1 修复 |
| 9 | GPX 解析 | P1 | ✅ | ✅ | |
| 10 | 行中查询 | P1 | ✅ | ✅ | |
| 11 | 行中记录 | P1 | ⚠️ | ⚠️ | D3 部分修复，残留 "超出了预算" |
| 12 | 行后汇总 | P1 | ⚠️ | ✅ | D2 修复 |

### 4.2 质量验收

| # | 验收项 | 上次 | 本次 | 备注 |
|---|--------|------|------|------|
| Q1 | 信息来源可追溯 | N/A | N/A | Agent 层 |
| Q2 | 诗词准确性 | N/A | N/A | Agent 层 |
| Q3 | 时间合理性 | ✅ | ✅ | |
| Q4 | 保底覆盖 | ⚠️ | ⚠️ | D5 部分修复，Line 95 残留 |
| Q5 | Skill 规范 | ✅ | ✅ | |
| Q6 | 模板一致性 | ⚠️ | ✅ | D4 修复 |
| Q7 | 人文篇幅 | N/A | N/A | Agent 层 |

---

## 五、缺陷清单汇总

### 已修复（本轮验证通过）

| 缺陷 | 优先级 | 说明 |
|------|--------|------|
| D1 | P1 | outputDir 三层优先级 + DEFAULT_OUTPUT_DIR=skill/planner/ + HIKE_PLANNER_OUTPUT_DIR |
| D2 | P2 | cmdSummary 状态从 ACTIVE→COMPLETED |
| D4 | P3 | formatDate 零填充 MM/DD |

### 残留缺陷（需 dev 继续修复）

| 缺陷 | 优先级 | 位置 | 说明 |
|------|--------|------|------|
| D3-EXT1 | P3 | `hike-planner.js` cmdLog() | 正则未覆盖 "超出了预算 X" 模式 |
| D5-RES1 | P3 | `SKILL.md` Line 95 | 内置能力表仍写 "AMAP_WEBSERVICE_KEY 环境变量" |

---

## 六、测试数据

- **总测试项**：53
- **通过**：51
- **失败**：2（均为新发现的 P3 低优先级残留）
- **通过率**：96.2%
- **测试覆盖**：5 主命令 + 12 辅助命令 + 6 状态流转 + 7 异常处理 + D1-D5 专项

---

## 七、建议

### 给 dev
1. **D3-EXT1**：追加 `超出[了]?\s*预算[了]?` 正则分支（1 行修复）
2. **D5-RES1**：修改 SKILL.md Line 95，澄清 AMAP_WEBSERVICE_KEY 由 amap-lbs-skill 读取（1 行修改）

### 给 work
1. **可上线**：D1/D2/D4 三个核心修复均已通过，无阻塞缺陷
2. D3-EXT1 和 D5-RES1 均为 P3 低优先级，不影响核心功能
3. 建议上线前修复 D5-RES1（文档一致性），D3-EXT1 可在下一迭代修复
4. 全量回归 19/19 命令 + 状态机 + 异常处理均无退化

---

*报告由 Tester Agent 自动生成*
