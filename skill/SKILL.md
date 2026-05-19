# hike-planner Skill — 徒步出行规划

> Keywords: 徒步 / hiking / 旅行规划 / trip planner / 路线搜索 / 交通查询 / 人文介绍 / 地图渲染
> 说明：本 skill 为用户提供一站式徒步出行规划，覆盖路线搜索、交通/酒店查询、人文信息收集、计划生成、行中记录、行后汇总全链路。5 条主命令，按出行阶段使用。

---

## 一、命令概览

| 命令 | 阶段 | 说明 |
|------|------|------|
| `hike-init [目的地]` | 行前规划 | 启动规划流程，交互收集需求，生成完整计划 |
| `hike-status` | 全程 | 查看当前行程状态与概览 |
| `hike-today` | 行中 | 查看今日计划（时间线 + 地图） |
| `hike-log <内容>` | 行中 | 记录实际数据（时间/费用/路线变更） |
| `hike-summary` | 行后 | 汇总行程（计划 vs 实际对比 + 归档） |

---

## 二、核心流程

### 1) hike-init — 行前规划（主入口）

```text
hike-init 古蜀道
```

Agent 会交互式收集需求：
1. 出发日期 + 返回日期
2. 出发城市 + 返程城市
3. 人员数量
4. 偏好（交通方式/住宿/体力/兴趣方向）
5. 输出目录（可选，默认 `skill/planner/`）

然后自动执行：
- 🔍 搜索徒步路线（两步路 + 小红书 + B站）
- 🚄 查询大交通（12306 火车票 / flyai 机票）
- 🏨 查询酒店（flyai 优先，web_search 保底）
- 📚 收集人文信息（Wikipedia + 小红书 + web_search）
- 📄 生成完整计划文档（按 PLAN_TEMPLATE 格式）
- 🗺️ 渲染行程地图（高德地图可视化链接）

**输出**：`{输出目录}/upcoming/<目的地>-<YYYY-MM>/README.md`

### 2) hike-status — 查看状态

```text
hike-status
```

返回当前行程的状态、时间线概览、完成进度。

### 3) hike-today — 今日计划

```text
hike-today
```

返回当天的完整时间线表 + 注意事项 + 地图链接。

### 4) hike-log — 行中记录

```text
hike-log 实际出发晚了30分钟，汉阳镇包车多花了20块
```

记录字段：
- 实际时间（与计划对比）
- 实际费用（与预算对比）
- 实际路线（路线变更记录）
- 备注（自由文本）

### 5) hike-summary — 行后汇总

```text
hike-summary
```

输出汇总报告：
- 📊 总费用（超标/节约）
- ⏱️ 总耗时（计划 vs 实际）
- 🥾 徒步里程（计划 vs 实际）
- 💡 经验教训汇总

归档到 `completed/` 目录。

---

## 三、能力边界

### 内置能力
| 能力 | 说明 |
|------|------|
| 徒步路线搜索 | 两步路轨迹 + 小红书攻略 + B站/YouTube 视频 |
| 行程地图渲染 | 依赖 amap-lbs-skill（需 AMAP_WEBSERVICE_KEY） |
| 人文信息收集 | Wikipedia + web_search + xiaohongshu |
| 行程计划生成 | 按 PLAN_TEMPLATE 标准格式输出 |
| 行中记录/行后汇总 | 实际 vs 计划对比 + 归档 |

### 外部依赖（可选，不可用自动降级）
| 依赖 | 能力 | 保底方案 |
|------|------|---------|
| `12306-train-assistant` | 火车票余票/价格/时刻查询 | 手动输入车次信息 |
| `amap-lbs-skill` | 距离/路线规划/地理编码 | 手动输入坐标/距离 |
| `flyai` | 机票/酒店可用与价格查询 | web_search 替代 |
| `xiaohongshu` | 小红书攻略搜索 | web_search + Wikipedia 替代 |

### 明确不做
- 🔒 自动订火车票、机票、酒店
- 🔒 支付任何费用
- 🔒 下单购买

> ⚠️ hike-planner **只查不买**，所有查询结果仅为规划参考。

---

## 四、计划模板格式

生成的 README.md 包含以下章节：

| 章节 | 内容 |
|------|------|
| 总览表 | 日期、行程概要、出行方式、班次、酒店、天气 |
| 每日安排 | 时间线表（时间/区间/节点/费用/备注）+ 地图链接 |
| 行程详情 | 目的地人文介绍（地理/历史/诗词/遗存/美食等，按目的地特性选 3-5 类） |
| 徒步路线详情 | 距离/爬升/节点/GPX来源/提示 |
| 装备清单 | 按类型分类 |
| 待办事项 | 订票/预订/购买等 checklist |

**人文写作规范**：
- 每类 600-1000 字，关联行程路线，有故事性和场景感
- 诗词引用原文准确，标注作者、朝代、创作背景
- 美食推荐指明觅食地点和大致价格
- 信息来源可追溯（Wikipedia/两步路/小红书链接）

---

## 五、状态流转

```
INIT → COLLECTING → PLANNING → CONFIRMED → ACTIVE → COMPLETED
                      ↑ 依赖不可用时可手动补全
```

---

## 六、调用方式

脚本入口：`scripts/hike-planner.js`

### 本地验证

```bash
# 初始化行程
node -e "const h=require('./scripts/hike-planner'); console.log(h.cmdInit('古蜀道'));"

# 查看状态
node -e "const h=require('./scripts/hike-planner'); console.log(h.cmdStatus());"

# 记录数据
node -e "const h=require('./scripts/hike-planner'); console.log(h.cmdLog('实际出发晚了30分钟'));"

# 汇总
node -e "const h=require('./scripts/hike-planner'); console.log(h.cmdSummary());"
```

### Agent 集成

Agent 调用 `cmdInit()` 后获得结构化需求对象，然后按以下顺序协调外部工具搜索数据：

1. **需求收集** → 交互式询问 → 结构化 `TripPlan` 对象
2. **路线搜索** → `web_search: site:2bulu.com <目的地> 徒步 轨迹` + `xiaohongshu__search_feeds`
3. **大交通查询** → `12306-train-assistant` / `flyai`
4. **锁定徒步时间** → 根据路线距离和预计用时确定徒步起止窗口（第二锚点）
5. **酒店查询** → `flyai` / `web_search`
6. **人文收集** → Wikipedia + web_search + xiaohongshu
7. **计划生成** → 6 步编排（锁大交通→锁徒步→顺排→倒排→小交通→填日常）→ 写入 README.md
8. **地图渲染** → `render-itinerary-map.sh` 生成高德链接

---

## 七、容错策略

| 场景 | 处理 |
|------|------|
| 目的地搜不到徒步路线 | 提示用户，转为通用旅行规划，建议上传 GPX |
| 两步路返回空结果 | web_search 其他徒步网站 + 建议上传 GPX |
| 火车票无余票 | 列出替代车次，提示候补或调整日期 |
| 酒店无可用房 | 扩大搜索范围或降级为 web_search/手动 |
| 小红书未登录 | 静默跳过，用 web_search + Wikipedia |
| 没有 AMAP_WEBSERVICE_KEY | 跳过地图渲染，纯文字输出 |
| GPX 文件格式异常 | 提示用户检查文件，跳过 GPX 解析 |
| 日期/目的地信息不完整 | 交互式追问，不猜测 |

---

## 八、文件位置

默认输出目录为 Skill 内的 `planner/`（与 scripts 同级），可通过命令行参数或环境变量覆盖：

- 行程计划：`{输出目录}/upcoming/<目的地>-<YYYY-MM>/README.md`
- 已完成：`{输出目录}/completed/<目的地>-<YYYY-MM>/README.md`
- 状态文件：`{输出目录}/.hike-planner-state.json`
- 模板参考：`references/PLAN_TEMPLATE.md`
- SOP 参考：`references/travel-agent-sop.md`

环境变量：
- `HIKE_PLANNER_OUTPUT_DIR`：覆盖默认输出目录（默认：`skill/planner/`）

> 注：`AMAP_WEBSERVICE_KEY` 由 `amap-lbs-skill` 读取（详见 三、外部依赖），hike-planner 本身不直接读取该变量。

---

## 版本

- v0.1.0：初始版本，5 条主命令，行前规划 + 行中记录 + 行后汇总

*维护：dev-agent* | *最后更新：2026-05-20*
