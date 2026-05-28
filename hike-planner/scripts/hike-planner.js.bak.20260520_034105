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
    actuals: {
      totalCost: null,
      totalTime: null,
      totalDistance: null,
      notes: [],
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
    days: trip.days.map(d => ({
      date: d.date,
      dayOfWeek: d.dayOfWeek,
      theme: d.theme,
      nodes: d.nodes.length,
      weather: d.weather,
      mapUrl: d.mapUrl,
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

  // 渲染当天时间线
  const timeline = day.nodes.map(n => ({
    time: n.time,
    type: n.type,
    name: n.name,
    detail: n.detail,
    cost: n.cost,
    remark: n.remark,
  }));

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

  // 尝试解析费用和延迟（支持多种自然语言表达）
  const costMatch = text.match(/(?:超出了预算|超(?:出)?预?算?了?|多[花用了]了?|额外[花用]?了?|超支了?)\s*(\d+)/);
  if (costMatch) {
    logEntry.costOverrun = parseInt(costMatch[1]);
  }
  const delayMatch = text.match(/[晚迟](?:了)?(\d+)\s*(?:分钟|min)/);
  if (delayMatch) {
    logEntry.delayMinutes = parseInt(delayMatch[1]);
  }

  trip.logs.push(logEntry);
  trip.updatedAt = new Date().toISOString();
  saveState(state, trip.outputDir);

  return {
    tripId: trip.tripId,
    logEntry: logEntry,
    totalLogs: trip.logs.length,
    message: `已记录 ${logDate}：${text}`,
  };
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
    const transport = day.nodes.filter(n => ['train', 'flight', 'bus', 'taxi'].includes(n.type)).map(n => n.type === 'train' ? '🚄' : n.type === 'flight' ? '✈️' : n.type === 'taxi' ? '🚗' : '🚌').join('') || '';
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
        const typeIcon = node.type === 'hiking' ? '🥾 ' : node.type === 'train' ? '🚄 ' : node.type === 'flight' ? '✈️ ' : node.type === 'taxi' ? '🚗 ' : node.type === 'bus' ? '🚌 ' : node.type === 'metro' ? '🚇 ' : '';
        const name = node.type === 'hiking' ? `${typeIcon}${node.name}，${node.detail}` : `${typeIcon}${node.name}`;
        lines.push(`| ${node.time} | ${node.type === 'hiking' ? '🥾 徒步' : node.type === 'hotel' ? '入住' : node.type === 'food' ? '餐饮' : '交通接驳'} | ${name} | ${costStr} | ${node.remark} |`);
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
