/**
 * hike-planner.js — State Machine + Command Handlers
 *
 * 5 条主命令：cmdInit / cmdStatus / cmdToday / cmdLog / cmdSummary
 * Agent 通过 module.exports 调用各函数，逐步填充 TripPlan，最终生成 README.md。
 *
 * v0.1.0 — 初始版本
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── 常量 ──────────────────────────────────────────────

const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'planner');
const STATE_FILE_NAME = '.hike-planner-state.json';
const TEMPLATE_NAME = 'PLAN_TEMPLATE.md';

const STATUS = {
  IDLE: 'IDLE',
  COLLECTING: 'COLLECTING',
  PLANNING: 'PLANNING',
  CONFIRMED: 'CONFIRMED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
};

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 节点实际状态
const NODE_STATUS = {
  COMPLETED: 'completed',   // ✅ 完成
  CHANGED: 'changed',       // 🔄 变更
  SKIPPED: 'skipped',       // ❌ 跳过
  PENDING: 'pending',       // ⏸️ 待定
};

const NODE_STATUS_ICONS = {
  completed: '✅',
  changed: '🔄',
  skipped: '❌',
  pending: '⏸️',
};

// 偏差阈值
const DEVIATION_THRESHOLDS = {
  timeMinutes: 30,    // 时间偏差 > 30min 提醒
  costYuan: 50,       // 费用偏差 > ¥50 提醒
};

// ── 订单短信解析正则 ──────────────────────────────

const SMS_PATTERNS = {
  // 12306 火车票订单短信
  // "您的订单D2008，成都东07:50-剑门关09:21，二等座01车02A号，订单E123456789"
  // "订单号E123456789，车次D2008，成都东07:50-剑门关09:21，二等座01车02A号"
  train: [
    // 模式1: 订单+车次号 直接格式（12306 常见：您的订单D2008，成都东07:50-剑门关09:21，二等座...）
    /订单\s*([GCKDTZYL]\d+)(?:次)?[，,、\s]*([\u4e00-\u9fa5]+?(?:东|南|西|北|关|桥|口|岭|站)?)\s*(\d{1,2}:\d{2})[-—~至到]\s*([\u4e00-\u9fa5]+?(?:东|南|西|北|关|桥|口|岭|站)?)\s*(\d{1,2}:\d{2})[，,、\s]*([\u4e00-\u9fa5]+座\d*车?\d*[号座FABC]?\d*).*?订单[号编]?\s*([A-Za-z0-9]+)/,
    // 模式2: 车次 + 出发站时间-到达站时间 + 座位 + 订单号
    /车次\s*([GCKDTZYL]\d+).*?([\u4e00-\u9fa5]+?(?:东|南|西|北|关|桥|口|岭|站)?)\s*(\d{1,2}:\d{2})\s*[-—~至到]\s*([\u4e00-\u9fa5]+?(?:东|南|西|北|关|桥|口|岭|站)?)\s*(\d{1,2}:\d{2}).*?([\u4e00-\u9fa5]+座?(?:\d+车\d+[号座FABC]?\d*)?).*?订单[号编]?\s*([A-Za-z0-9]+)/,
    // 模式3: 订单号 + 车次 变体
    /订单[号编]?\s*([A-Za-z0-9]+).*?车次\s*([GCKDTZYL]\d+).*?([\u4e00-\u9fa5]+?(?:东|南|西|北|关|桥|口|岭|站)?)\s*(\d{1,2}:\d{2})\s*[-—~至到]\s*([\u4e00-\u9fa5]+?(?:东|南|西|北|关|桥|口|岭|站)?)\s*(\d{1,2}:\d{2}).*?([\u4e00-\u9fa5]+座)/,
  ],
  // 航司/机票订单短信
  // "航班CA1234，北京-成都，2026-05-13 08:00-10:30，经济舱，订单FL9876543"
  flight: [
    /航班\s*([A-Z]{2}\d+).*?([\u4e00-\u9fa5]+)\s*[-—~至到]\s*([\u4e00-\u9fa5]+).*?(\d{4}-\d{2}-\d{2})\s*(\d{1,2}:\d{2})\s*[-—~至到]\s*(\d{1,2}:\d{2}).*?([\u4e00-\u9fa5]+舱).*?订单[号编]?\s*([A-Za-z0-9]+)/,
    /订单[号编]?\s*([A-Za-z0-9]+).*?航班\s*([A-Z]{2}\d+).*?([\u4e00-\u9fa5]+)\s*[-—~至到]\s*([\u4e00-\u9fa5]+).*?(\d{4}-\d{2}-\d{2})\s*(\d{1,2}:\d{2})\s*[-—~至到]\s*(\d{1,2}:\d{2})/,
  ],
  // 酒店订单短信
  // "XX宾馆已预订，入住2026-05-14，退房2026-05-16，标准间含双早，订单H123456"
  hotel: [
    /([\u4e00-\u9fa5]+(?:酒店|宾馆|客栈|民宿|饭店|公寓|旅社))[，,已]*(?:已)?预订[成已]?功?.{0,10}入住[日时]?(?:间)?[：:]?\s*(\d{4}-\d{2}-\d{2}).{0,10}(?:退[房住]|离店)[日时]?(?:间)?[：:]?\s*(\d{4}-\d{2}-\d{2}).*?([\u4e00-\u9fa5]+(?:房|间)).*?订单[号编]?\s*([A-Za-z0-9]+)/,
    /订单[号编]?\s*([A-Za-z0-9]+).*?([\u4e00-\u9fa5]+(?:酒店|宾馆|客栈|民宿|饭店|公寓|旅社)).*?入住[日时]?(?:间)?[：:]?\s*(\d{4}-\d{2}-\d{2}).*?(?:退[房住]|离店)[日时]?(?:间)?[：:]?\s*(\d{4}-\d{2}-\d{2}).*?([\u4e00-\u9fa5]+(?:房|间))/,
    // 简化: 酒店名 + 入住日期范围内 days
    /([\u4e00-\u9fa5]+(?:酒店|宾馆|客栈|民宿|饭店|公寓|旅社)).*?(\d{4}-\d{2}-\d{2}).*?([\u4e00-\u9fa5]+(?:房|间)).*?订单[号编]?\s*([A-Za-z0-9]+)/,
  ],
};

// ── 节点类型 → 路线类型映射（地图渲染用） ────────────
// 高德地图支持的路线类型: driving / walking / riding / transfer / straight

const NODE_ROUTE_TYPE = {
  // 徒步/登山 → walking（步行导航，仅用于短距连续段）
  hiking: 'walking',
  // 包车/出租/自驾 → driving
  taxi: 'driving',
  car: 'driving',
  selfdrive: 'driving',
  // 公交/大巴 → driving（高德无公交专用路线，remark 标注实际方式）
  bus: 'driving',
  // 火车/飞机 → straight（直线，remark 标注实际方式）
  train: 'straight',
  flight: 'straight',
  // 地铁 → transfer
  metro: 'transfer',
  // 默认: driving
};

const DEFAULT_ROUTE_TYPE = 'driving';

/**
 * 获取节点的路线类型（用于地图渲染）
 */
function getNodeRouteType(node) {
  return NODE_ROUTE_TYPE[node.type] || DEFAULT_ROUTE_TYPE;
}

/**
 * 获取节点的交通标签（用于时间线展示）
 * 徒步节点 → "🥾 徒步"
 * taxi/car → "🚗 包车"
 * bus → "🚌 公交"
 * train → "🚄 火车"
 * flight → "✈️ 飞机"
 * metro → "🚇 地铁"
 */
function getNodeTransportLabel(node) {
  const labelMap = {
    hiking: '🥾 徒步',
    taxi: '🚗 包车',
    car: '🚗 自驾',
    selfdrive: '🚗 自驾',
    bus: '🚌 公交',
    train: '🚄 火车',
    flight: '✈️ 飞机',
    metro: '🚇 地铁',
    hotel: '🏨 入住',
    food: '🍴 餐饮',
    rest: '💤 休息',
    sightseeing: '📸 游览',
    other: '📍 其他',
  };
  return labelMap[node.type] || `📍 ${node.type || '其他'}`;
}

/**
 * 为某一天的节点生成路线类型列表（逗号分隔），供地图渲染脚本使用
 * 在相邻节点间生成一段路线，根据两个节点的类型决定路线类型：
 * - 如果前后都是 hiking 节点 → walking
 * - 包车/出租/自驾之间 → driving
 * - 火车/飞机到达后到下一节点之间 → driving（接驳段）
 * - 火车/飞机出发前的节点 → driving（送站段）
 *
 * @returns {object} { routeTypes: string, segments: [{from,to,routeType}] }
 */
function getRouteTypesForDay(day) {
  const nodes = day.nodes;
  if (nodes.length < 2) return { routeTypes: '', segments: [] };

  const segments = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    let routeType = DEFAULT_ROUTE_TYPE;

    // 如果两端都是徒步 → walking
    if (a.type === 'hiking' && b.type === 'hiking') {
      routeType = 'walking';
    }
    // 如果任一端是徒步（开始/结束徒步的接驳段）→ driving
    else if (a.type === 'hiking' || b.type === 'hiking') {
      routeType = 'driving';
    }
    // 火车/飞机段 → straight
    else if ((a.type === 'train' || a.type === 'flight') &&
             (b.type === 'train' || b.type === 'flight')) {
      routeType = 'straight';
    }
    // 从火车/飞机下来后 → driving（接驳）
    else if (a.type === 'train' || a.type === 'flight') {
      routeType = 'driving';
    }
    // 去往火车/飞机前 → driving（送站）
    else if (b.type === 'train' || b.type === 'flight') {
      routeType = 'driving';
    }
    // 其他按节点类型
    else {
      routeType = getNodeRouteType(a) === 'walking' ? 'walking' : getNodeRouteType(a);
    }

    segments.push({
      from: a.name,
      to: b.name,
      routeType: routeType,
    });
  }

  const routeTypes = segments.map(s => s.routeType).join(',');
  return { routeTypes, segments };
}

// ── 工具函数 ──────────────────────────────────────────

function getOutputDir(options) {
  if (options && options.outputDir) return options.outputDir;
  if (process.env.HIKE_PLANNER_OUTPUT_DIR) return process.env.HIKE_PLANNER_OUTPUT_DIR;
  return DEFAULT_OUTPUT_DIR;
}

function getStatePath(outputDir) {
  return path.join(outputDir, STATE_FILE_NAME);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}/${day}`;
}

function formatFullDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function getWeekday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  return WEEKDAYS[d.getDay()];
}

function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function generateTripId(destination, startDate) {
  const slug = destination.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').toLowerCase();
  const date = startDate.replace(/-/g, '').substring(0, 6);
  return `${slug}-${date}`;
}

function dateDiff(a, b) {
  return Math.round((new Date(b + 'T00:00:00+08:00') - new Date(a + 'T00:00:00+08:00')) / 86400000);
}

// ── 状态读写 ──────────────────────────────────────────

function loadState(outputDir) {
  const filePath = getStatePath(outputDir);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    // ignore
  }
  return { status: STATUS.IDLE, trips: {} };
}

function saveState(state, outputDir) {
  const filePath = getStatePath(outputDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

function getTrip(state, tripId) {
  if (state.activeTripId && tripId == null) {
    return state.trips[state.activeTripId] || null;
  }
  return tripId ? (state.trips[tripId] || null) : null;
}

// ── TripPlan 工厂 ─────────────────────────────────────

function createTripPlan(destination, options) {
  const outputDir = getOutputDir(options);
  const now = new Date().toISOString();
  return {
    tripId: '',
    status: STATUS.COLLECTING,
    destination: destination || '',
    dates: { start: '', end: '' },
    origin: '',
    returnTo: '',
    participants: 1,
    preferences: {
      transport: '',
      accommodation: '',
      fitness: '',
      interests: [],
    },
    outputDir: outputDir,
    createdAt: now,
    updatedAt: now,
    days: [],
    hikingRoutes: [],
    culture: {},
    equipment: {},
    todos: [],
    totalBudget: 0,
    mapUrls: [],
    logs: [],
    orderConfirmations: [],   // 已解析的订单短信
    actuals: {
      totalCost: null,
      totalTime: null,
      totalDistance: null,
      notes: [],
      deviations: [],          // 偏差记录 [{ type, node, planned, actual, diff, alert }]
    },
  };
}

// ── 命令：hike-init ───────────────────────────────────

/**
 * 初始化行程。返回 { tripId, status, collectPrompt } 供 Agent 交互式收集需求。
 * @param {string} destination - 目的地
 * @param {object} options - { outputDir }
 */
function cmdInit(destination, options) {
  const outputDir = getOutputDir(options);
  let state = loadState(outputDir);

  // 检查是否已有进行中的行程
  if (state.activeTripId) {
    const activeTrip = state.trips[state.activeTripId];
    if (activeTrip && activeTrip.status !== STATUS.COMPLETED) {
      return {
        error: `已有进行中的行程「${activeTrip.destination}」（${activeTrip.tripId}），请先完成或取消`,
        activeTripId: activeTrip.tripId,
      };
    }
  }

  const trip = createTripPlan(destination, options);
  // 先分配一个临时 tripId
  trip.tripId = generateTripId(destination, getToday());

  state.trips[trip.tripId] = trip;
  state.activeTripId = trip.tripId;
  saveState(state, outputDir);

  return {
    tripId: trip.tripId,
    status: trip.status,
    collectPrompt: {
      message: `好的！开始规划「${destination}」的徒步行程。请告诉我以下信息：`,
      questions: [
        { id: 'startDate', label: '出发日期（如 2026-05-13）', required: true },
        { id: 'endDate', label: '返回日期（单程可不填）', required: false },
        { id: 'origin', label: '从哪个城市出发？', required: true },
        { id: 'returnTo', label: '回到哪个城市？（同出发可不填）', required: false },
        { id: 'participants', label: '几个人？', required: false, default: '1' },
        { id: 'transport', label: '交通偏好（火车/飞机/自驾）', required: false },
        { id: 'accommodation', label: '住宿偏好（酒店类型/预算）', required: false },
        { id: 'fitness', label: '体力水平（轻松/适中/高强度）', required: false },
        { id: 'interests', label: '兴趣方向（历史文化/自然风光/美食等）', required: false },
      ],
    },
  };
}

// ── 命令：设置需求 ────────────────────────────────────

/**
 * 设置收集到的需求。Agent 交互完成后调用。
 * @param {object} requirements - 用户输入的需求数据
 */
function cmdSetRequirements(requirements) {
  const outputDir = getOutputDir(requirements);
  let state = loadState(outputDir);
  const tripId = requirements.tripId || state.activeTripId;
  if (!tripId || !state.trips[tripId]) {
    return { error: '没有活动的行程，请先 hike-init' };
  }

  const trip = state.trips[tripId];
  const r = requirements;

  // 更新日期
  if (r.startDate) trip.dates.start = r.startDate;
  if (r.endDate) trip.dates.end = r.endDate;
  if (r.startDate && !r.endDate) trip.dates.end = r.startDate;

  // 更新出发/返回地
  if (r.origin) trip.origin = r.origin;
  if (r.returnTo) trip.returnTo = r.returnTo;
  if (!trip.returnTo && trip.origin) trip.returnTo = trip.origin;

  // 更新人数和偏好
  if (r.participants) trip.participants = parseInt(r.participants) || 1;
  if (r.transport) trip.preferences.transport = r.transport;
  if (r.accommodation) trip.preferences.accommodation = r.accommodation;
  if (r.fitness) trip.preferences.fitness = r.fitness;
  if (r.interests) {
    trip.preferences.interests = typeof r.interests === 'string'
      ? r.interests.split(/[,，]/).map(s => s.trim())
      : r.interests;
  }

  // 重新生成 tripId（用真实日期）
  if (r.startDate) {
    const newTripId = generateTripId(trip.destination, r.startDate);
    if (newTripId !== tripId) {
      delete state.trips[tripId];
      trip.tripId = newTripId;
      state.trips[newTripId] = trip;
      state.activeTripId = newTripId;
    }
  }

  // 自动计算天数并填充 days 数组
  if (trip.dates.start && trip.dates.end) {
    const numDays = dateDiff(trip.dates.start, trip.dates.end) + 1;
    // Day 0 = 抵达日, Day 1..N-1 = 活动日, Day N = 返程日
    // 如果只有1天，就是当天往返
    trip.days = [];
    for (let i = 0; i < numDays; i++) {
      const d = addDays(trip.dates.start, i);
      trip.days.push({
        date: d,
        dayOfWeek: getWeekday(d),
        dayIndex: i,
        theme: i === 0 ? '出发/抵达' : (i === numDays - 1 ? '返程' : '徒步'),
        weather: { condition: '', high: null, low: null },
        nodes: [],
        mapUrl: '',
        dayCost: 0,
      });
    }
  }

  trip.status = STATUS.PLANNING;
  trip.updatedAt = new Date().toISOString();
  saveState(state, outputDir);

  return {
    tripId: trip.tripId,
    status: trip.status,
    summary: {
      destination: trip.destination,
      dates: `${trip.dates.start} ~ ${trip.dates.end}（${trip.days.length}天）`,
      origin: trip.origin,
      returnTo: trip.returnTo,
      participants: trip.participants,
      preferences: trip.preferences,
    },
    nextSteps: [
      'search_routes: 搜索徒步路线（两步路+小红书+B站）',
      'search_transport: 查询大交通（12306/flyai）',
      'search_hotels: 查询酒店（flyai/web_search）',
      'search_culture: 收集人文信息（Wikipedia/xiaohongshu）',
      'generate_plan: 生成完整行程计划',
      'render_maps: 渲染行程地图',
    ],
  };
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── 命令：设置徒步路线 ────────────────────────────────

function cmdSetHikingRoutes(routes, tripId) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state, tripId);
  if (!trip) return { error: '没有活动的行程' };

  trip.hikingRoutes = routes.map(r => ({
    name: r.name || '未命名路线',
    distance: r.distance || null,
    distanceUnit: r.distanceUnit || 'km',
    ascent: r.ascent || null,
    descent: r.descent || null,
    maxAltitude: r.maxAltitude || null,
    estimatedTime: r.estimatedTime || '',
    type: r.type || '混合',
    keyNodes: r.keyNodes || [],
    gpxSource: r.gpxSource || '',
    tips: r.tips || '',
    dayIndex: r.dayIndex || 0,
  }));
  trip.updatedAt = new Date().toISOString();
  saveState(state, trip.outputDir);

  return { tripId: trip.tripId, hikingRoutes: trip.hikingRoutes };
}

// ── 命令：设置交通 ────────────────────────────────────

function cmdSetDayNode(dayIndex, node, tripId) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state, tripId);
  if (!trip) return { error: '没有活动的行程' };
  if (!trip.days[dayIndex]) return { error: `第 ${dayIndex} 天不存在` };

  trip.days[dayIndex].nodes.push({
    time: node.time || '',
    type: node.type || 'other',
    name: node.name || '',
    detail: node.detail || '',
    cost: node.cost || null,
    remark: node.remark || '',
  });
  trip.days[dayIndex].dayCost = trip.days[dayIndex].nodes.reduce((s, n) => s + (n.cost || 0), 0);
  trip.totalBudget = trip.days.reduce((s, d) => s + d.dayCost, 0);
  trip.updatedAt = new Date().toISOString();
  saveState(state, trip.outputDir);

  return { tripId: trip.tripId, dayIndex, day: trip.days[dayIndex] };
}

function cmdSetDayWeather(dayIndex, weather, tripId) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state, tripId);
  if (!trip) return { error: '没有活动的行程' };
  if (!trip.days[dayIndex]) return { error: `第 ${dayIndex} 天不存在` };

  trip.days[dayIndex].weather = weather;
  trip.updatedAt = new Date().toISOString();
  saveState(state, trip.outputDir);

  return { tripId: trip.tripId, dayIndex, weather };
}

// ── 命令：设置文化信息 ────────────────────────────────

function cmdSetCulture(culture, tripId) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state, tripId);
  if (!trip) return { error: '没有活动的行程' };

  trip.culture = culture;
  trip.updatedAt = new Date().toISOString();
  saveState(state, trip.outputDir);

  return { tripId: trip.tripId, cultureKeys: Object.keys(trip.culture) };
}

// ── 命令：设置装备 + 待办 ──────────────────────────────

function cmdSetEquipment(equipment, tripId) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state, tripId);
  if (!trip) return { error: '没有活动的行程' };

  trip.equipment = equipment;
  trip.updatedAt = new Date().toISOString();
  saveState(state, trip.outputDir);

  return { tripId: trip.tripId, equipment: trip.equipment };
}

function cmdSetTodos(todos, tripId) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state, tripId);
  if (!trip) return { error: '没有活动的行程' };

  trip.todos = todos;
  trip.updatedAt = new Date().toISOString();
  saveState(state, trip.outputDir);

  return { tripId: trip.tripId, todos: trip.todos };
}

// ── 命令：设置地图链接 ────────────────────────────────

function cmdSetMapUrl(dayIndex, mapUrl, tripId) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state, tripId);
  if (!trip) return { error: '没有活动的行程' };
  if (!trip.days[dayIndex]) return { error: `第 ${dayIndex} 天不存在` };

  trip.days[dayIndex].mapUrl = mapUrl;
  if (!trip.mapUrls.includes(mapUrl)) {
    trip.mapUrls.push(mapUrl);
  }
  trip.updatedAt = new Date().toISOString();
  saveState(state, trip.outputDir);

  return { tripId: trip.tripId, dayIndex, mapUrl };
}

// ── 命令：确认计划 ────────────────────────────────────

function cmdConfirm(tripId) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state, tripId);
  if (!trip) return { error: '没有活动的行程' };

  trip.status = STATUS.CONFIRMED;
  trip.updatedAt = new Date().toISOString();
  saveState(state, trip.outputDir);

  return { tripId: trip.tripId, status: trip.status };
}

// ── 命令：出发（激活） ────────────────────────────────

function cmdActivate(tripId) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state, tripId);
  if (!trip) return { error: '没有活动的行程' };
  if (trip.status !== STATUS.CONFIRMED) {
    return { error: `行程状态「${trip.status}」无法激活，需要先确认` };
  }

  trip.status = STATUS.ACTIVE;
  trip.updatedAt = new Date().toISOString();
  saveState(state, trip.outputDir);

  return { tripId: trip.tripId, status: trip.status };
}

// ── 命令：hike-status ─────────────────────────────────

function cmdStatus(tripId) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state, tripId);
  if (!trip) {
    return { status: STATUS.IDLE, message: '没有活动的行程。输入 hike-init <目的地> 开始规划。' };
  }

  const totalDays = trip.days.length;
  const completedDays = trip.days.filter(d => d.nodes.length > 0).length;
  const totalCost = trip.totalBudget || trip.days.reduce((s, d) => s + d.dayCost, 0);

  // 统计节点状态
  const allNodes = trip.days.flatMap(d => d.nodes.map(n => ({ ...n, date: d.date })));
  const nodeStats = {
    total: allNodes.length,
    completed: allNodes.filter(n => n.actualStatus === NODE_STATUS.COMPLETED).length,
    changed: allNodes.filter(n => n.actualStatus === NODE_STATUS.CHANGED).length,
    skipped: allNodes.filter(n => n.actualStatus === NODE_STATUS.SKIPPED).length,
    pending: allNodes.filter(n => n.actualStatus === NODE_STATUS.PENDING).length,
    untracked: allNodes.filter(n => !n.actualStatus).length,
  };
  nodeStats.tracked = nodeStats.completed + nodeStats.changed + nodeStats.skipped + nodeStats.pending;

  // 汇总偏差
  const alertDeviations = trip.actuals.deviations.filter(d => d.alert);
  const infoDeviations = trip.actuals.deviations.filter(d => !d.alert);

  return {
    tripId: trip.tripId,
    status: trip.status,
    destination: trip.destination,
    dates: trip.dates,
    origin: trip.origin,
    returnTo: trip.returnTo,
    participants: trip.participants,
    preferences: trip.preferences,
    progress: totalDays > 0 ? `${completedDays}/${totalDays} 天已规划` : '未开始规划',
    hikingRoutes: trip.hikingRoutes.length,
    totalBudget: totalCost,
    logs: trip.logs.length,
    outputDir: trip.outputDir,
    // 订单确认状态
    orderConfirmations: trip.orderConfirmations.length,
    // 节点执行状态
    nodeStatus: nodeStats,
    // 偏差总览
    deviations: {
      alert: alertDeviations.length,
      info: infoDeviations.length,
      alerts: alertDeviations.map(d => ({
        type: d.type,
        node: d.node,
        planned: d.planned,
        actual: d.actual,
        diffText: d.diffText,
      })),
    },
    days: trip.days.map(d => ({
      date: d.date,
      dayOfWeek: d.dayOfWeek,
      theme: d.theme,
      nodes: d.nodes.length,
      weather: d.weather,
      mapUrl: d.mapUrl,
      // 每天节点状态摘要
      nodeSummary: {
        total: d.nodes.length,
        completed: d.nodes.filter(n => n.actualStatus === NODE_STATUS.COMPLETED).length,
        changed: d.nodes.filter(n => n.actualStatus === NODE_STATUS.CHANGED).length,
        skipped: d.nodes.filter(n => n.actualStatus === NODE_STATUS.SKIPPED).length,
        pending: d.nodes.filter(n => n.actualStatus === NODE_STATUS.PENDING).length,
        untracked: d.nodes.filter(n => !n.actualStatus).length,
      },
    })),
  };
}

// ── 命令：hike-today ──────────────────────────────────

function cmdToday(dateStr) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state);
  if (!trip) return { error: '没有活动的行程' };

  const targetDate = dateStr || getToday();
  const day = trip.days.find(d => d.date === targetDate);
  if (!day) {
    return {
      error: `${targetDate} 不在行程范围内（${trip.dates.start} ~ ${trip.dates.end}）`,
      availableDays: trip.days.map(d => `${d.date}（${d.dayOfWeek}）`),
    };
  }

  // 渲染当天时间线（含计划 vs 实际对比）
  const timeline = day.nodes.map(n => ({
    time: n.time,
    type: n.type,
    name: n.name,
    detail: n.detail,
    cost: n.cost,
    remark: n.remark,
    // 实际数据（如有）
    actualStatus: n.actualStatus || null,
    actualIcon: n.actualStatusIcon || null,
    actualTime: n.actualTime || null,
    actualCost: n.actualCost || null,
    actualRemark: n.actualRemark || null,
  }));

  // 汇总当天偏差
  const dayDeviations = trip.actuals.deviations.filter(d => {
    const nd = trip.days[day.dayIndex];
    return nd && nd.nodes.some(n => n.name === d.node);
  });

  return {
    date: day.date,
    dayOfWeek: day.dayOfWeek,
    theme: day.theme,
    weather: day.weather,
    timeline: timeline,
    mapUrl: day.mapUrl,
    estimatedCost: day.dayCost,
    dayIndex: day.dayIndex,
    totalDays: trip.days.length,
    tips: day.nodes.filter(n => n.type === 'hiking').map(n => n.remark).filter(Boolean),
    // 计划 vs 实际总览
    comparison: {
      hasActual: timeline.some(t => t.actualStatus || t.actualTime || t.actualCost),
      deviations: dayDeviations.length > 0 ? dayDeviations.map(d => ({
        type: d.type,
        node: d.node,
        diffText: d.diffText,
        alert: d.alert,
      })) : [],
    },
  };
}

// ── 订单短信解析 ────────────────────────────────

/**
 * 解析订单确认短信，提取结构化数据
 * @param {string} text - SMS 文本
 * @returns {object|null} { type, data }
 */
function parseOrderSMS(text) {
  // 先检测短信类型
  // 火车票关键词: 车次、列车、二等座/一等座/硬卧、12306
  if (/车次|列车|等座|硬卧|软卧|硬座|无座|\b[GCKDTZYL]\d+\b/.test(text)) {
    for (const pattern of SMS_PATTERNS.train) {
      const m = text.match(pattern);
      if (m) {
        const groups = m.slice(1);
        // 统一提取顺序: carNum, fromSta, fromTime, toSta, toTime, seat, orderId
        let carNum, fromSta, fromTime, toSta, toTime, seat, orderId;
        if (pattern.source.startsWith('订单\\s*')) {
          // 模式1（新）: 订单+车次号 直接格式 → carNum, fromSta, fromTime, toSta, toTime, seat, orderId
          [carNum, fromSta, fromTime, toSta, toTime, seat, orderId] = groups;
        } else if (pattern.source.startsWith('车次')) {
          // 模式2: 车次 + 出发站时间-到达站时间 + 座位 + 订单号
          [carNum, fromSta, fromTime, toSta, toTime, seat, orderId] = groups;
        } else {
          // 模式3: 订单号 + 车次 变体
          [orderId, carNum, fromSta, fromTime, toSta, toTime, seat] = groups;
        }
        // 清理站名
        fromSta = fromSta.replace(/站$/, '站').replace(/站站/, '站');
        if (!fromSta.endsWith('站')) fromSta += '站';
        toSta = toSta.replace(/站$/, '站').replace(/站站/, '站');
        // 有些站名本身包含"站"字但不以站结尾（如 剑门关站），规范化
        if (!toSta.endsWith('站') && !/(?:东|南|西|北|关|桥|口|岭)$/.test(toSta)) toSta += '站';
        return {
          type: 'train',
          data: { carNum, fromSta, fromTime, toSta, toTime, seat, orderId, raw: text },
        };
      }
    }
  }

  // 机票关键词: 航班、舱、登机
  if (/航班|舱|登机|起飞|到达/.test(text)) {
    for (const pattern of SMS_PATTERNS.flight) {
      const m = text.match(pattern);
      if (m) {
        const groups = m.slice(1);
        let flightNum, fromCity, toCity, date, fromTime, toTime, seat, orderId;
        if (pattern.source.startsWith('航班')) {
          [flightNum, fromCity, toCity, date, fromTime, toTime, seat, orderId] = groups;
        } else {
          [orderId, flightNum, fromCity, toCity, date, fromTime, toTime] = groups;
          seat = '';
        }
        return {
          type: 'flight',
          data: { flightNum, fromCity, toCity, date, fromTime, toTime, seat, orderId, raw: text },
        };
      }
    }
  }

  // 酒店关键词: 酒店/宾馆/客栈 + 入住/退房/预订
  if (/(?:酒店|宾馆|客栈|民宿|饭店|公寓|旅社).*(?:入住|退房|预订|已订)/.test(text) ||
      /(?:入住|退房|预订|已订).*(?:酒店|宾馆|客栈|民宿|饭店|公寓|旅社)/.test(text)) {
    for (const pattern of SMS_PATTERNS.hotel) {
      const m = text.match(pattern);
      if (m) {
        const groups = m.slice(1);
        let hotelName, checkIn, checkOut, roomType, orderId;
        if (groups.length === 5) {
          // 完整模式
          if (/^[A-Za-z0-9]+$/.test(groups[0])) {
            [orderId, hotelName, checkIn, checkOut, roomType] = groups;
          } else {
            [hotelName, checkIn, checkOut, roomType, orderId] = groups;
          }
        } else if (groups.length === 4) {
          // 简化模式
          [hotelName, checkIn, roomType, orderId] = groups;
          checkOut = '';
        }
        return {
          type: 'hotel',
          data: { hotelName, checkIn, checkOut, roomType, orderId, raw: text },
        };
      }
    }
  }

  return null;
}

/**
 * 将解析的订单 SMS 应用到 TripPlan
 * @param {object} trip - TripPlan
 * @param {object} sms - parseOrderSMS 返回值
 * @returns {object} { applied, matchedDayIndex, detail }
 */
function applySMSToTrip(trip, sms) {
  if (!sms || !sms.data) return { applied: false, detail: '无效的 SMS 数据' };

  const { type, data } = sms;
  const result = { applied: false, detail: '', type };

  if (type === 'train') {
    // 匹配日期：根据出发时间和行程日期匹配 day
    const trainDate = guessDateFromTrip(trip, data.fromTime, data.toTime);
    let matchedDay = null;
    if (trainDate) {
      matchedDay = trip.days.find(d => d.date === trainDate);
    }
    if (!matchedDay) {
      // fallback: 查找第一个有 train 类型节点的日期
      matchedDay = trip.days.find(d => d.nodes.some(n => n.type === 'train'));
    }

    // 构建节点数据（不覆盖已有 cost）
    const nodeData = {
      time: `${data.fromTime}-${data.toTime}`,
      type: 'train',
      name: `${data.fromSta}→${data.toSta}`,
      detail: data.carNum,
      remark: `${data.seat}，订单${data.orderId}`,
    };

    if (matchedDay) {
      // 查找已存在的同类型节点，支持覆盖
      const existingIdx = matchedDay.nodes.findIndex(
        n => n.type === 'train' && (n.detail === data.carNum || n.name.includes(data.fromSta))
      );
      if (existingIdx >= 0) {
        matchedDay.nodes[existingIdx] = { ...matchedDay.nodes[existingIdx], ...nodeData };
        result.action = 'updated';
        result.nodeIndex = existingIdx;
      } else {
        matchedDay.nodes.push(nodeData);
        result.action = 'added';
        result.nodeIndex = matchedDay.nodes.length - 1;
      }
      result.matchedDayIndex = trip.days.indexOf(matchedDay);
      result.matchedDay = matchedDay.date;
      matchedDay.dayCost = matchedDay.nodes.reduce((s, n) => s + (n.cost || 0), 0);
    } else {
      // 无匹配日，提示用户指定
      result.applied = false;
      result.detail = `无法匹配行程日期，请用 hike-log "交通 D${trip.days[0]?.date || ''}" 指定日期后再试`;
      return result;
    }

    result.applied = true;
    result.detail = `${result.action === 'updated' ? '已更新' : '已添加'}火车票：${data.carNum} ${data.fromSta}${data.fromTime}→${data.toSta}${data.toTime}，${data.seat}`;
    result.node = nodeData;

  } else if (type === 'flight') {
    let matchedDay = trip.days.find(d => d.date === data.date);
    if (!matchedDay) {
      matchedDay = trip.days.find(d => d.nodes.some(n => n.type === 'flight'));
    }

    const nodeData = {
      time: `${data.fromTime}-${data.toTime}`,
      type: 'flight',
      name: `${data.fromCity}→${data.toCity}`,
      detail: data.flightNum,
      remark: `${data.seat}，订单${data.orderId}`,
    };

    if (matchedDay) {
      const existingIdx = matchedDay.nodes.findIndex(
        n => n.type === 'flight' && (n.detail === data.flightNum || n.name.includes(data.fromCity))
      );
      if (existingIdx >= 0) {
        matchedDay.nodes[existingIdx] = { ...matchedDay.nodes[existingIdx], ...nodeData };
        result.action = 'updated';
      } else {
        matchedDay.nodes.push(nodeData);
        result.action = 'added';
      }
      result.matchedDayIndex = trip.days.indexOf(matchedDay);
      result.matchedDay = matchedDay.date;
    } else {
      result.applied = false;
      result.detail = `无法匹配行程日期 ${data.date}，请检查行程日期范围`;
      return result;
    }

    result.applied = true;
    result.detail = `${result.action === 'updated' ? '已更新' : '已添加'}机票：${data.flightNum} ${data.fromCity}→${data.toCity} ${data.date} ${data.fromTime}-${data.toTime}，${data.seat}`;
    result.node = nodeData;

  } else if (type === 'hotel') {
    // 酒店匹配：查找入住日期范围内的 day
    const hotelStartDate = data.checkIn;
    let matchedDays = [];
    if (hotelStartDate && data.checkOut) {
      matchedDays = trip.days.filter(d => d.date >= hotelStartDate && d.date < data.checkOut);
    } else if (hotelStartDate) {
      matchedDays = trip.days.filter(d => d.date === hotelStartDate);
    } else {
      matchedDays = trip.days.filter(d => d.nodes.some(n => n.type === 'hotel'));
    }

    if (matchedDays.length === 0) {
      result.applied = false;
      result.detail = `无法匹配行程日期 ${hotelStartDate || '(未识别)'}，请检查行程日期范围`;
      return result;
    }

    // 为每个匹配的日期添加/更新酒店节点
    const nights = matchedDays.length;
    matchedDays.forEach((day, i) => {
      const nodeData = {
        time: i === 0 ? '入住' : '',
        type: 'hotel',
        name: data.hotelName,
        detail: `${data.roomType}`,
        remark: `${i === 0 ? `入住${data.checkIn}，` : ''}退房${data.checkOut}，订单${data.orderId}${i > 0 ? '（续住）' : ''}${/含.*[早双]/.test(data.raw || '') ? '，含早' : ''}`,
      };

      const existingIdx = day.nodes.findIndex(
        n => n.type === 'hotel' && n.name === data.hotelName
      );
      if (existingIdx >= 0) {
        day.nodes[existingIdx] = { ...day.nodes[existingIdx], ...nodeData };
      } else {
        day.nodes.push(nodeData);
      }
      day.dayCost = day.nodes.reduce((s, n) => s + (n.cost || 0), 0);
    });

    result.applied = true;
    result.action = 'added';
    result.detail = `已添加酒店：${data.hotelName} ${data.roomType}，${data.checkIn} 入住${nights > 1 ? `，共${nights}晚` : ''}`;
    result.matchedDayIndex = trip.days.indexOf(matchedDays[0]);
    result.matchedDay = matchedDays[0].date;
  }

  // 记录订单确认
  trip.orderConfirmations.push({
    type,
    orderId: data.orderId,
    timestamp: new Date().toISOString(),
    data,
  });

  trip.updatedAt = new Date().toISOString();
  return result;
}

function guessDateFromTrip(trip, fromTime, toTime) {
  // 根据时间判断：如果出发时间在上午，通常是行程首日
  const hour = parseInt(fromTime);
  // 找行程范围内第一个日期
  if (hour <= 12) {
    // 上午出发→找第0天
    return trip.days[0]?.date || null;
  } else {
    // 下午/晚上出发→可能是前一天或当天
    return trip.days[0]?.date || null;
  }
}

// ── 计划 vs 实际对比 ─────────────────────────────

/**
 * 比较实际数据与计划，产生偏差记录
 * @param {object} trip - TripPlan
 * @param {object} actual - { dayIndex, nodeIndex, actualTime, actualCost, actualRemark }
 * @returns {object} { alert, deviations }
 */
function compareActualVsPlan(trip, actual) {
  const deviations = [];
  const day = trip.days[actual.dayIndex];
  if (!day || !day.nodes[actual.nodeIndex]) {
    return { alert: false, deviations: [], message: '未找到对应节点' };
  }

  const node = day.nodes[actual.nodeIndex];

  // 1. 时间偏差
  if (actual.actualTime && node.time) {
    const plannedMinutes = parseTimeToMinutes(node.time);
    const actualMinutes = parseTimeToMinutes(actual.actualTime);
    if (plannedMinutes != null && actualMinutes != null) {
      const diff = actualMinutes - plannedMinutes;
      if (Math.abs(diff) > DEVIATION_THRESHOLDS.timeMinutes) {
        deviations.push({
          type: 'time',
          node: node.name,
          planned: node.time,
          actual: actual.actualTime,
          diffMinutes: diff,
          diffText: `${diff > 0 ? '+' : ''}${diff} 分钟（${diff > 0 ? '延迟' : '提前'}）`,
          alert: true,
          threshold: DEVIATION_THRESHOLDS.timeMinutes,
        });
      }
    }
  }

  // 2. 费用偏差
  if (actual.actualCost != null && node.cost != null) {
    const diff = actual.actualCost - node.cost;
    if (Math.abs(diff) > DEVIATION_THRESHOLDS.costYuan) {
      deviations.push({
        type: 'cost',
        node: node.name,
        planned: node.cost,
        actual: actual.actualCost,
        diffYuan: diff,
        diffText: `${diff > 0 ? '+' : ''}¥${diff}（${diff > 0 ? '超支' : '节约'}）`,
        alert: true,
        threshold: DEVIATION_THRESHOLDS.costYuan,
      });
    }
  }

  // 3. 路线/备注变更
  if (actual.actualRemark) {
    deviations.push({
      type: 'remark',
      node: node.name,
      planned: node.remark || node.detail || '',
      actual: actual.actualRemark,
      alert: false,
    });
  }

  // 存储偏差
  if (deviations.length > 0) {
    trip.actuals.deviations.push(...deviations);
  }

  const hasAlert = deviations.some(d => d.alert);
  return {
    alert: hasAlert,
    deviations,
    message: hasAlert
      ? `⚠️ 偏差提醒：${deviations.filter(d => d.alert).map(d => d.diffText).join('；')}`
      : (deviations.length > 0 ? '已记录差异（未超阈值）' : '无偏差'),
  };
}

function parseTimeToMinutes(timeStr) {
  // 支持 "07:50-09:21" 格式，取出发时间的分钟数
  // 也支持纯时间 "07:50"
  const t = timeStr.split('-')[0].trim();
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

// ── 节点状态操作 ─────────────────────────────────

/**
 * 手动标记节点状态
 * @param {string} tripId
 * @param {number} dayIndex
 * @param {number} nodeIndex
 * @param {string} status - completed / changed / skipped / pending
 * @param {object} actual - 可选的实际数据
 */
function cmdSetNodeStatus(tripId, dayIndex, nodeIndex, status, actual) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state, tripId);
  if (!trip) return { error: '没有活动的行程' };

  const day = trip.days[dayIndex];
  if (!day) return { error: `第 ${dayIndex} 天不存在` };

  const node = day.nodes[nodeIndex];
  if (!node) return { error: `第 ${dayIndex} 天第 ${nodeIndex} 个节点不存在` };

  const validStatuses = Object.values(NODE_STATUS);
  if (!validStatuses.includes(status)) {
    return { error: `无效的状态: ${status}，支持: ${validStatuses.join(', ')}` };
  }

  node.actualStatus = status;
  node.actualStatusIcon = NODE_STATUS_ICONS[status];

  if (actual) {
    if (actual.actualTime) node.actualTime = actual.actualTime;
    if (actual.actualCost != null) node.actualCost = actual.actualCost;
    if (actual.actualRemark) node.actualRemark = actual.actualRemark;
  }

  // 如果提供了实际数据，触发偏差对比
  let compareResult = null;
  if (actual && (actual.actualTime || actual.actualCost != null || actual.actualRemark)) {
    compareResult = compareActualVsPlan(trip, { dayIndex, nodeIndex, ...actual });
  }

  trip.updatedAt = new Date().toISOString();
  saveState(state, trip.outputDir);

  return {
    tripId: trip.tripId,
    dayIndex,
    nodeIndex,
    node: node.name,
    status: node.actualStatus,
    icon: node.actualStatusIcon,
    actual: { actualTime: node.actualTime, actualCost: node.actualCost, actualRemark: node.actualRemark },
    compare: compareResult,
  };
}

// ── 命令：hike-log ────────────────────────────────────

function cmdLog(text, dateStr) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state);
  if (!trip) return { error: '没有活动的行程' };

  const logDate = dateStr || getToday();
  const logEntry = {
    date: logDate,
    timestamp: new Date().toISOString(),
    text: text,
  };

  const result = {
    tripId: trip.tripId,
    logEntry: logEntry,
    totalLogs: trip.logs.length + 1,
    message: '',
  };

  // ── 1. 检测节点状态标记关键字 ──
  const statusMarkers = [
    { pattern: /✅|完成|已完成|搞完/, status: NODE_STATUS.COMPLETED },
    { pattern: /🔄|变更|变了|改成|改为|调整/, status: NODE_STATUS.CHANGED },
    { pattern: /❌|跳过|取消|没去|不去/, status: NODE_STATUS.SKIPPED },
    { pattern: /⏸️|待定|暂缓|推迟/, status: NODE_STATUS.PENDING },
  ];

  let detectedStatus = null;
  for (const marker of statusMarkers) {
    if (marker.pattern.test(text)) {
      detectedStatus = marker.status;
      break;
    }
  }

  // ── 2. 解析实际时间（多种自然语言表达） ──
  const actualTimePatterns = [
    /实际[出发到]*[时间：:：]\s*(\d{1,2}:\d{2})/,
    /实[际在][到出发]*(\d{1,2}:\d{2})/,
    /(\d{1,2}:\d{2})[出发到]的/,
    /改到\s*(\d{1,2}:\d{2})/,
    /调整[为到]\s*(\d{1,2}:\d{2})/,
    /实际.*?(\d{1,2}:\d{2}\s*[-—~至到]\s*\d{1,2}:\d{2})/,
  ];
  let actualTime = null;
  for (const p of actualTimePatterns) {
    const m = text.match(p);
    if (m) { actualTime = m[1].trim(); break; }
  }

  // ── 3. 解析实际费用 ──
  let actualCost = null;
  // 明确实际费用
  const actualCostMatch = text.match(/实际[花费用]了?\s*(\d+(?:\.\d{1,2})?)\s*(?:块|元|¥)/);
  if (actualCostMatch) {
    actualCost = parseFloat(actualCostMatch[1]);
  } else {
    // 经典超支/多花钱模式
    const costMatch = text.match(/(?:超出了预算|超(?:出)?预?算?了?|多[花用了]了?|额外[花用]?了?|超支了?)\s*(\d+(?:\.\d{1,2})?)\s*(?:块|元|¥)?/);
    if (costMatch) {
      logEntry.costOverrun = parseFloat(costMatch[1]);
    }
    // 新增: "实际多花了 ¥X" 模式 (¥在数字前)
    if (!logEntry.costOverrun) {
      const extraCostMatch = text.match(/实际多[花用了]了?\s*¥\s*(\d+(?:\.\d{1,2})?)/);
      if (extraCostMatch) {
        logEntry.costOverrun = parseFloat(extraCostMatch[1]);
      }
    }
    // 花了 / 用了 ¥XX（排除「多花/额外花」避免与 costOverrun 冲突）
    const spentMatch = text.match(/(?<!多)(?<!额外)(?:[花用]了)\s*(\d+(?:\.\d{1,2})?)\s*(?:块|元|¥)/);
    if (spentMatch && !actualCostMatch) {
      actualCost = parseFloat(spentMatch[1]);
    }
  }

  // ── 4. 解析时间延迟（经典模式） ──
  const delayMatch = text.match(/[晚迟](?:了)?(\d+)\s*(?:分钟|min)/);
  if (delayMatch) {
    logEntry.delayMinutes = parseInt(delayMatch[1]);
  }

  // ── 5. 尝试订单 SMS 解析 ──
  const sms = parseOrderSMS(text);
  if (sms) {
    logEntry.smsType = sms.type;
    const smsResult = applySMSToTrip(trip, sms);
    result.sms = sms;
    result.smsApply = smsResult;
    logEntry.smsApplied = smsResult.applied;
    logEntry.smsDetail = smsResult.detail;
  }

  // ── 6. 尝试匹配当日节点进行偏差对比 ──
  result.compare = null;
  const todayDay = trip.days.find(d => d.date === logDate);
  if (todayDay && todayDay.nodes.length > 0) {
    // 尝试根据文本内容匹配节点
    let matchedNodeIndex = -1;
    const nodeKeywords = text;
    for (let i = 0; i < todayDay.nodes.length; i++) {
      const node = todayDay.nodes[i];
      const nodeText = `${node.name} ${node.detail} ${node.type}`;
      // 关键词匹配
      if (node.name && node.name.length > 1 && nodeKeywords.includes(node.name.substring(0, 2))) {
        matchedNodeIndex = i;
        break;
      }
      if (node.detail && node.detail.length > 1 && nodeKeywords.includes(node.detail)) {
        matchedNodeIndex = i;
        break;
      }
    }

    // 如果没匹配到但有实际数据或偏差，默认匹配第一个交通/徒步节点
    if (matchedNodeIndex === -1 && (actualTime || actualCost != null || logEntry.delayMinutes || logEntry.costOverrun)) {
      matchedNodeIndex = 0;
    }

    if (matchedNodeIndex >= 0 && (actualTime || actualCost != null || detectedStatus || logEntry.delayMinutes || logEntry.costOverrun)) {
      const node = todayDay.nodes[matchedNodeIndex];

      // 从 delayMinutes 推导 actualTime
      if (!actualTime && logEntry.delayMinutes && node.time) {
        const plannedMinutes = parseTimeToMinutes(node.time);
        if (plannedMinutes != null) {
          const delayedMinutes = plannedMinutes + logEntry.delayMinutes;
          const h = Math.floor(delayedMinutes / 60);
          const m = delayedMinutes % 60;
          actualTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
      }

      // 从 costOverrun 推导 actualCost
      if (actualCost == null && logEntry.costOverrun != null && node.cost != null) {
        actualCost = node.cost + logEntry.costOverrun;
      }

      // 更新 actual 数据
      if (actualTime) {
        node.actualTime = actualTime;
        logEntry.actualTime = actualTime;
      }
      if (actualCost != null) {
        node.actualCost = actualCost;
        logEntry.actualCost = actualCost;
      }

      // 更新节点状态
      if (detectedStatus) {
        node.actualStatus = detectedStatus;
        node.actualStatusIcon = NODE_STATUS_ICONS[detectedStatus];
        logEntry.nodeStatus = detectedStatus;
      }

      // 触发偏差对比
      const compare = compareActualVsPlan(trip, {
        dayIndex: trip.days.indexOf(todayDay),
        nodeIndex: matchedNodeIndex,
        actualTime: actualTime,
        actualCost: actualCost,
        actualRemark: text,
      });
      result.compare = compare;
      logEntry.deviations = compare.deviations;
    }
  }

  // 最终记录
  trip.logs.push(logEntry);
  trip.updatedAt = new Date().toISOString();
  saveState(state, trip.outputDir);

  // 构建返回消息
  const parts = [`已记录 ${logDate}：${text}`];
  if (sms && sms.type) {
    const icon = sms.type === 'train' ? '🚄' : sms.type === 'flight' ? '✈️' : '🏨';
    const action = result.smsApply?.applied ? (result.smsApply.action === 'updated' ? '更新' : '添加') : '检测到但未';
    parts.push(`${icon} ${action}订单：${result.smsApply?.detail || sms.data.orderId}`);
  }
  if (result.compare && result.compare.alert) {
    parts.push(`⚠️ ${result.compare.message}`);
  }
  if (detectedStatus) {
    parts.push(`${NODE_STATUS_ICONS[detectedStatus]} 节点状态已标记为：${detectedStatus}`);
  }
  result.message = parts.join('\n');

  return result;
}

// ── 命令：hike-summary ────────────────────────────────

function cmdSummary(tripId) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state, tripId);
  if (!trip) return { error: '没有活动的行程' };

  // 汇总 logs
  const costOverruns = trip.logs.filter(l => l.costOverrun).reduce((s, l) => s + l.costOverrun, 0);
  const totalDelayMins = trip.logs.filter(l => l.delayMinutes).reduce((s, l) => s + l.delayMinutes, 0);
  const routeChanges = trip.logs.filter(l => l.text.includes('路线变更') || l.text.includes('绕路'));
  const allNotes = trip.logs.map(l => `- ${l.date} ${l.text}`);

  // 节点状态统计
  const allNodes = trip.days.flatMap(d => d.nodes);
  const nodeStats = {
    total: allNodes.length,
    completed: allNodes.filter(n => n.actualStatus === NODE_STATUS.COMPLETED).length,
    changed: allNodes.filter(n => n.actualStatus === NODE_STATUS.CHANGED).length,
    skipped: allNodes.filter(n => n.actualStatus === NODE_STATUS.SKIPPED).length,
    pending: allNodes.filter(n => n.actualStatus === NODE_STATUS.PENDING).length,
  };

  // 订单确认汇总
  const orderSummary = trip.orderConfirmations.map(o => ({
    type: o.type,
    orderId: o.orderId,
    timestamp: o.timestamp,
  }));

  // 更新状态为完成（提前设置，确保 summary.status 显示 COMPLETED）
  trip.status = STATUS.COMPLETED;
  trip.updatedAt = new Date().toISOString();
  state.activeTripId = null;

  // 汇总实际数据
  const summary = {
    tripId: trip.tripId,
    destination: trip.destination,
    dates: trip.dates,
    status: trip.status,
    budget: {
      planned: trip.totalBudget || trip.days.reduce((s, d) => s + d.dayCost, 0),
      overrun: costOverruns,
      message: costOverruns > 0
        ? `超出预算 ¥${costOverruns}`
        : (costOverruns < 0 ? `节约 ¥${Math.abs(costOverruns)}` : '未记录费用偏差'),
    },
    timekeeping: {
      totalDelayMinutes: totalDelayMins,
      message: totalDelayMins > 0
        ? `累计延迟 ${totalDelayMins} 分钟`
        : '未记录时间偏差',
    },
    hiking: {
      plannedRoutes: trip.hikingRoutes.length,
      plannedDistance: trip.hikingRoutes.reduce((s, r) => s + (r.distance || 0), 0),
    },
    nodes: nodeStats,                       // 节点执行状态汇总
    orderConfirmations: orderSummary,       // 订单确认汇总
    deviations: {
      total: trip.actuals.deviations.length,
      alerts: trip.actuals.deviations.filter(d => d.alert),
    },
    logs: {
      total: trip.logs.length,
      routeChanges: routeChanges.length,
      notes: allNotes,
    },
    outputPath: path.join(trip.outputDir, 'upcoming', trip.tripId, 'README.md'),
    archivePath: path.join(trip.outputDir, 'completed', trip.tripId, 'README.md'),
  };

  saveState(state, trip.outputDir);

  return summary;
}

// ── 命令：生成 README.md ───────────────────────────────

/**
 * 按 PLAN_TEMPLATE 格式渲染完整 README
 * @param {string} tripId
 * @returns {object} { content, filePath }
 */
function cmdGeneratePlan(tripId) {
  const state = loadState(getOutputDir());
  const trip = getTrip(state, tripId);
  if (!trip) return { error: '没有活动的行程' };

  let md = renderPlanReadme(trip);

  const dir = path.join(trip.outputDir, 'upcoming', trip.tripId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, 'README.md');
  fs.writeFileSync(filePath, md, 'utf8');

  trip.status = STATUS.CONFIRMED;
  trip.updatedAt = new Date().toISOString();
  saveState(state, trip.outputDir);

  return {
    tripId: trip.tripId,
    filePath: filePath,
    content: md,
    message: `行程计划已生成：${filePath}`,
  };
}

// ── Markdown 渲染器 ────────────────────────────────────

function renderPlanReadme(trip) {
  const lines = [];

  // 标题
  lines.push(`# 🥾 ${trip.destination} 出行计划`);
  lines.push('');
  lines.push(`**出行日期**：${formatFullDate(trip.dates.start)} - ${formatFullDate(trip.dates.end)}`);
  lines.push(`**目的地**：${trip.destination}`);
  lines.push(`**人员**：${trip.participants}人`);
  lines.push('');

  // 总览表
  lines.push('## 总览');
  lines.push('');
  lines.push('| 日期 | 星期 | 行程概要 | 出行方式 | 班次/车牌 | 住宿酒店 | 含早 | 天气 |');
  lines.push('|------|------|---------|---------|---------|---------|------|------|');
  for (const day of trip.days) {
    const transportNodes = day.nodes.filter(n => ['train', 'flight', 'bus', 'taxi', 'car', 'selfdrive', 'metro', 'hiking'].includes(n.type));
    const transport = transportNodes.map(n => getNodeTransportLabel(n)).join(' ') || '';
    const schedule = day.nodes.filter(n => ['train', 'flight', 'bus'].includes(n.type)).map(n => n.detail).join(', ') || '';
    const hotel = day.nodes.find(n => n.type === 'hotel');
    const hotelName = hotel ? hotel.name : '';
    const hasBreakfast = hotel ? (hotel.remark && /含(早|双早|早餐|二?早)/.test(hotel.remark) ? '是' : '否') : '';
    const weather = day.weather.condition ? `${day.weather.condition}${day.weather.high ? ` ${day.weather.high}°C/${day.weather.low}°C` : ''}` : '';
    lines.push(`| ${formatDate(day.date)} | ${day.dayOfWeek} | ${day.theme} | ${transport} | ${schedule} | ${hotelName} | ${hasBreakfast} | ${weather} |`);
  }
  lines.push('');

  // 每日安排
  lines.push('## 每日安排');
  lines.push('');
  for (const day of trip.days) {
    lines.push(`### DAY ${day.dayIndex} — ${formatDate(day.date)}（${day.dayOfWeek}）：${day.theme}`);
    lines.push('');
    if (day.nodes.length === 0) {
      lines.push('| 时间 | 区间 | 节点详情 | 费用 | 备注 |');
      lines.push('|------|------|---------|------|------|');
      lines.push('| | | 待规划 | | |');
    } else {
      lines.push('| 时间 | 区间 | 节点详情 | 费用 | 备注 |');
      lines.push('|------|------|---------|------|------|');
      for (const node of day.nodes) {
        const costStr = node.cost != null ? `¥${node.cost}` : '';
        const transportLabel = getNodeTransportLabel(node);
        const isHiking = node.type === 'hiking';
        const name = isHiking ? `${node.name}，${node.detail}` : node.name;
        lines.push(`| ${node.time} | ${transportLabel} | ${name} | ${costStr} | ${node.remark} |`);
      }
    }
    lines.push('');
    if (day.mapUrl) {
      lines.push(`> 🗺️ [查看地图](${day.mapUrl})`);
    }
    if (day.dayCost > 0) {
      lines.push(`> 💰 本日费用：约¥${day.dayCost}`);
    }
    lines.push('');
  }

  // 行程详情
  lines.push('## 行程详情');
  lines.push('');
  lines.push(`### ${trip.destination}`);
  lines.push('');

  // 文化信息
  if (trip.culture && Object.keys(trip.culture).length > 0) {
    const cultureOrder = ['geography', 'history', 'poetry', 'relics', 'worldHeritage', 'food', 'religion', 'festivals'];
    for (const key of cultureOrder) {
      if (trip.culture[key]) {
        const titles = {
          geography: '地理风貌',
          history: '历史渊源',
          poetry: '人文与诗词',
          relics: '遗存遗迹',
          worldHeritage: '世界遗产',
          food: '美食特产',
          religion: '宗教文化',
          festivals: '民俗节庆',
        };
        lines.push(`### ${titles[key] || key}`);
        lines.push('');
        lines.push(trip.culture[key]);
        lines.push('');
      }
    }
  } else {
    lines.push('*待收集人文信息...*');
    lines.push('');
  }

  // 徒步路线
  if (trip.hikingRoutes.length > 0) {
    lines.push('### 徒步路线详情');
    lines.push('');
    for (const route of trip.hikingRoutes) {
      lines.push(`#### ${route.name}`);
      lines.push('');
      lines.push('| 项目 | 数据 |');
      lines.push('|------|------|');
      if (route.distance) lines.push(`| 距离 | ${route.distance}${route.distanceUnit} |`);
      if (route.ascent) lines.push(`| 爬升 | ${route.ascent}m |`);
      if (route.descent) lines.push(`| 下降 | ${route.descent}m |`);
      if (route.maxAltitude) lines.push(`| 最高海拔 | ${route.maxAltitude}m |`);
      if (route.estimatedTime) lines.push(`| 预计用时 | ${route.estimatedTime} |`);
      if (route.type) lines.push(`| 路线类型 | ${route.type} |`);
      if (route.keyNodes.length > 0) lines.push(`| 关键节点 | ${route.keyNodes.join('→')} |`);
      if (route.gpxSource) lines.push(`| GPX来源 | ${route.gpxSource} |`);
      if (route.tips) lines.push(`| ⚠️ 提示 | ${route.tips} |`);
      lines.push('');
    }
  }

  // 装备清单
  lines.push('## 装备清单');
  lines.push('');
  if (trip.equipment && Object.keys(trip.equipment).length > 0) {
    lines.push('| 类型 | 物品 |');
    lines.push('|------|------|');
    for (const [type, items] of Object.entries(trip.equipment)) {
      lines.push(`| ${type} | ${Array.isArray(items) ? items.join('、') : items} |`);
    }
  } else {
    lines.push('| 类型 | 物品 |');
    lines.push('|------|------|');
    const eqDefaults = ['鞋', '衣', '包', '导航', '水', '食物', '防晒', '药品', '证件', '电子', '其他'];
    for (const t of eqDefaults) {
      lines.push(`| ${t} | |`);
    }
  }
  lines.push('');

  // 待办事项
  lines.push('## 待办事项');
  lines.push('');
  if (trip.todos.length > 0) {
    for (const todo of trip.todos) {
      lines.push(`- [ ] ${todo}`);
    }
  } else {
    lines.push('- [ ] 待补充');
  }
  lines.push('');

  lines.push(`*创建日期：${formatDate(trip.createdAt.split('T')[0])}*`);

  return lines.join('\n');
}

// ── 导出 ──────────────────────────────────────────────

module.exports = {
  // 常量
  STATUS,
  NODE_STATUS,
  DEFAULT_OUTPUT_DIR,

  // 5 条主命令
  cmdInit,
  cmdStatus,
  cmdToday,
  cmdLog,
  cmdSummary,

  // 辅助命令（Agent 逐步填充）
  cmdSetRequirements,
  cmdSetHikingRoutes,
  cmdSetDayNode,
  cmdSetDayWeather,
  cmdSetCulture,
  cmdSetEquipment,
  cmdSetTodos,
  cmdSetMapUrl,
  cmdConfirm,
  cmdActivate,
  cmdGeneratePlan,

  // 新增：订单短信解析 + 实时行程修订
  cmdSetNodeStatus,
  parseOrderSMS,
  applySMSToTrip,
  compareActualVsPlan,

  // 新增：节点类型 → 路线类型映射（地图渲染）
  NODE_ROUTE_TYPE,
  getNodeRouteType,
  getNodeTransportLabel,
  getRouteTypesForDay,

  // 工具函数
  getOutputDir,
  generateTripId,
  formatDate,
  formatFullDate,
  getWeekday,
  getToday,
  addDays,
  renderPlanReadme,
};
