/**
 * hike-planner v0.4.0 测试脚本
 * 测试 Day 级重写 + 文化分类修正
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// 使用临时输出目录
const TEST_OUTPUT_DIR = '/tmp/hike-planner-test-' + Date.now();
process.env.HIKE_PLANNER_OUTPUT_DIR = TEST_OUTPUT_DIR;

const MODULE_PATH = path.join(__dirname, 'hike-planner.js');
let hike;
try {
  hike = require(MODULE_PATH);
} catch (e) {
  console.error('无法加载模块:', e.message);
  process.exit(1);
}

const {
  cmdInit, cmdSetRequirements, cmdSetDayNode, cmdAddDay, cmdDelDay, cmdReorderDay,
  cmdStatus, cmdToday, cmdLog, cmdList, cmdSelect, cmdSetHikingRoutes,
  cmdSetCulture, renderPlanReadme,
  cmdAddNode, cmdRemoveNode, cmdReorderNode,
  getOutputDir,
} = hike;

// ── 工具函数 ──────────────────────────────────────────

function mkTripsDir() {
  const d = path.join(TEST_OUTPUT_DIR, 'upcoming');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function cleanup() {
  execSync(`rm -rf ${TEST_OUTPUT_DIR}`);
}

function readStateFile() {
  const statePath = path.join(TEST_OUTPUT_DIR, '.hike-planner-state.json');
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function getTripFromState(state, tripId) {
  if (tripId && state.trips[tripId]) return state.trips[tripId];
  if (state.activeTripId && state.trips[state.activeTripId]) return state.trips[state.activeTripId];
  return null;
}

function getDaysFromStatus(tripId) {
  const st = cmdStatus(tripId);
  if (st.error) throw new Error('cmdStatus error: ' + st.error);
  return st.days;
}

function archiveCurrentTrip() {
  // 将当前活跃行程归档，释放 activeTripId 以便创建新行程
  try {
    const r = cmdList();
    if (r.trips && r.trips.length > 0) {
      // 逐个归档
      for (const t of r.trips) {
        cmdList(t.tripId);
      }
    }
  } catch (e) {
    // ignore
  }
}

function createTestTrip(days = 3) {
  mkTripsDir();
  archiveCurrentTrip();

  const r = cmdInit('2026-06-01', '古蜀道徒步', '徒步+文化探访', { outputDir: TEST_OUTPUT_DIR });
  if (r.error) throw new Error('init failed: ' + r.error);
  const tripId = r.tripId;

  const endDate = new Date('2026-06-01T00:00:00+08:00');
  endDate.setDate(endDate.getDate() + days - 1);
  const endStr = endDate.toISOString().split('T')[0];

  cmdSetRequirements({
    tripId,
    startDate: '2026-06-01',
    endDate: endStr,
    destination: '古蜀道徒步',
    activity: '徒步+文化探访',
    origin: '成都',
    participants: 2,
  });

  // 预创建 upcoming/tripId 目录（cmdAddDay 等会写入 README）
  const upcomingDir = path.join(TEST_OUTPUT_DIR, 'upcoming', tripId);
  if (!fs.existsSync(upcomingDir)) {
    fs.mkdirSync(upcomingDir, { recursive: true });
  }

  return tripId;
}

function countCultureSections(md) {
  const cultureTitles = ['地理风貌', '历史渊源', '人文与诗词', '遗存遗迹', '世界遗产', '美食特产', '宗教文化', '民俗节庆'];
  return cultureTitles.filter(t => md.includes('### ' + t)).length;
}

function makeMinimalTrip(cultureOverride) {
  return {
    tripId: 'test-trip',
    status: 'PLANNING',
    destination: '古蜀道徒步',
    dates: { start: '2026-06-01', end: '2026-06-03' },
    participants: 2,
    preferences: { interests: ['徒步'], fitness: '适中' },
    outputDir: TEST_OUTPUT_DIR,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    days: [
      { date: '2026-06-01', dayOfWeek: '周一', dayIndex: 0, theme: '出发', nodes: [], mapUrl: '', dayCost: 0 },
      { date: '2026-06-02', dayOfWeek: '周二', dayIndex: 1, theme: '徒步', nodes: [], mapUrl: '', dayCost: 0 },
      { date: '2026-06-03', dayOfWeek: '周三', dayIndex: 2, theme: '返程', nodes: [], mapUrl: '', dayCost: 0 },
    ],
    hikingRoutes: [],
    culture: cultureOverride || {},
    equipment: {},
    todos: [],
    totalBudget: 0,
    mapUrls: [],
    logs: [],
    orderConfirmations: [],
    actuals: { totalCost: null, totalTime: null, totalDistance: null, notes: [], deviations: [] },
  };
}

// ── 测试框架 ──────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

function section(name) {
  console.log(`\n── ${name}`);
}

// ── 测试用例 ──────────────────────────────────────────

async function runTests() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  hike-planner v0.4.0 测试              ║');
  console.log('╚══════════════════════════════════════════╝');

  try {
    // T1: cmdAddDay
    section('T1: cmdAddDay（Day 级新增行程段）');
    {
      const tripId = createTestTrip(3);

      const r = cmdAddDay('day2', '古蜀道剑门关段徒步', tripId);
      assert(!r.error, 'cmdAddDay 不返回 error');

      const state = readStateFile();
      const trip = getTripFromState(state, tripId);
      const day2NodeNames = trip.days[1].nodes.map(n => n.name);
      assert(day2NodeNames.includes('古蜀道剑门关段徒步'),
        `Day2 nodes 包含新增节点: ${JSON.stringify(day2NodeNames)}`);

      const readmePath = path.join(TEST_OUTPUT_DIR, 'upcoming', tripId, 'README.md');
      const md = fs.readFileSync(readmePath, 'utf8');
      assert(md.includes('古蜀道剑门关段徒步'), 'README.md 包含新增节点名称');
    }

    // T2: cmdDelDay
    section('T2: cmdDelDay（Day 级删除日程）');
    {
      const tripId = createTestTrip(4);
      const state1 = readStateFile();
      const trip1 = getTripFromState(state1, tripId);
      const lenBefore = trip1.days.length;

      const r = cmdDelDay('day2', tripId);
      assert(!r.error, 'cmdDelDay 不返回 error');

      const state2 = readStateFile();
      const trip2 = getTripFromState(state2, tripId);
      assert(trip2.days.length === lenBefore - 1,
        `days 数组长度减少 1（${lenBefore} → ${trip2.days.length}）`);

      const readmePath = path.join(TEST_OUTPUT_DIR, 'upcoming', tripId, 'README.md');
      const md = fs.readFileSync(readmePath, 'utf8');
      assert(md.includes('DAY 1') && md.includes('DAY 2') && md.includes('DAY 3') && !md.includes('DAY 4'),
        'README.md 正确渲染 3 天（不含 DAY 4）');
    }

    // T3: cmdReorderDay after
    section('T3: cmdReorderDay — after');
    {
      const tripId = createTestTrip(4);
      const state1 = readStateFile();
      const trip1 = getTripFromState(state1, tripId);
      const day4Theme = trip1.days[3].theme;

      const r = cmdReorderDay('day4', 'after', 'day1', tripId);
      assert(!r.error, 'cmdReorderDay after 不返回 error');

      const state2 = readStateFile();
      const trip2 = getTripFromState(state2, tripId);
      assert(trip2.days[1].theme === day4Theme,
        `Day4 移到 Day1 之后，成为新的 Day2（theme=${trip2.days[1].theme}）`);

      const readmePath = path.join(TEST_OUTPUT_DIR, 'upcoming', tripId, 'README.md');
      const md = fs.readFileSync(readmePath, 'utf8');
      assert(md.includes('DAY 2') && md.includes('DAY 3') && md.includes('DAY 4'),
        'README.md 正确渲染重排后 4 天');
    }

    // T4: cmdReorderDay before
    section('T4: cmdReorderDay — before');
    {
      const tripId = createTestTrip(4);
      const state1 = readStateFile();
      const trip1 = getTripFromState(state1, tripId);
      const day3Theme = trip1.days[2].theme;

      const r = cmdReorderDay('day3', 'before', 'day1', tripId);
      assert(!r.error, 'cmdReorderDay before 不返回 error');

      const state2 = readStateFile();
      const trip2 = getTripFromState(state2, tripId);
      assert(trip2.days[0].theme === day3Theme,
        `Day3 移到 Day1 之前，成为新的 Day1（theme=${trip2.days[0].theme}）`);
    }

    // T5: cmdReorderDay to (swap)
    section('T5: cmdReorderDay — to (swap)');
    {
      const tripId = createTestTrip(4);
      const state1 = readStateFile();
      const trip1 = getTripFromState(state1, tripId);
      const day3Theme = trip1.days[2].theme;
      const day2Theme = trip1.days[1].theme;

      const r = cmdReorderDay('day3', 'to', 'day2', tripId);
      assert(!r.error, 'cmdReorderDay to 不返回 error');

      const state2 = readStateFile();
      const trip2 = getTripFromState(state2, tripId);
      assert(trip2.days[1].theme === day3Theme,
        `Day3 替换 Day2 位置（Day2 theme=${trip2.days[1].theme}）`);
      assert(trip2.days[2].theme === day2Theme,
        `Day2 替换 Day3 位置（Day3 theme=${trip2.days[2].theme}）`);
    }

    // T6: 向后兼容别名
    section('T6: 向后兼容别名');
    {
      const tripId = createTestTrip(3);

      const r1 = cmdAddNode('day1', '别名测试节点', tripId);
      assert(!r1.error, 'cmdAddNode 别名不报错');

      const state1 = readStateFile();
      const trip1 = getTripFromState(state1, tripId);
      assert(trip1.days[0].nodes.some(n => n.name === '别名测试节点'),
        'cmdAddNode 行为同 cmdAddDay');

      const lenBefore = trip1.days.length;
      const r2 = cmdRemoveNode('day2', tripId);
      assert(!r2.error, 'cmdRemoveNode 别名不报错');

      const state2 = readStateFile();
      const trip2 = getTripFromState(state2, tripId);
      assert(trip2.days.length === lenBefore - 1,
        'cmdRemoveNode 行为同 cmdDelDay（days 减少 1）');

      const tripId2 = createTestTrip(3);
      const r3 = cmdReorderNode('day3', 'after', 'day1', tripId2);
      assert(!r3.error, 'cmdReorderNode 别名不报错');
    }

    // T7: 文化分类（使用内联 trip 对象测试 renderPlanReadme）
    section('T7: 文化分类 3-5 个占位节');
    {
      // 7a: 无文化信息时输出 3 个占位节（不是 4 个）
      {
        const trip = makeMinimalTrip({});
        const md = renderPlanReadme(trip);
        const cnt = countCultureSections(md);
        assert(cnt === 3, `无文化信息时输出 3 个占位节（实际: ${cnt}）`);
        assert(cnt !== 4, '不是 4 个（确认旧版逻辑已修正）');
      }

      // 7b: 有 2 个文化分类时补齐到 3 个（不是 4 个）
      {
        const trip = makeMinimalTrip({
          history: '古蜀道历史悠久...',
          food: '剑门关豆腐...',
        });
        const md = renderPlanReadme(trip);
        const cnt = countCultureSections(md);
        assert(cnt === 3, `2 个文化分类时补齐到 3 个（实际: ${cnt}）`);
        assert(cnt !== 4, '补齐后不是 4 个（确认旧版逻辑已修正）');
      }

      // 7c: 有 5 个文化分类时保持 5 个
      {
        const trip = makeMinimalTrip({
          history: '历史...',
          food: '美食...',
          geography: '地理...',
          poetry: '诗词...',
          relics: '遗迹...',
        });
        const md = renderPlanReadme(trip);
        const cnt = countCultureSections(md);
        assert(cnt === 5, `5 个文化分类时保持 5 个（实际: ${cnt}）`);
      }
    }

    // T8: 回归测试
    section('T8: 回归测试');
    {
      const tripId = createTestTrip(3);

      const rInit = cmdInit('2026-07-01', '测试目的地', '徒步', { outputDir: TEST_OUTPUT_DIR });
      assert(!rInit.error || rInit.error.includes('已有进行中的行程'), 'cmdInit 正常');

      const rStatus = cmdStatus(tripId);
      assert(!rStatus.error, 'cmdStatus 正常');
      assert(rStatus.tripId === tripId, 'cmdStatus 返回正确 tripId');

      const rToday = cmdToday('2026-06-01');
      assert(!rToday.error, 'cmdToday 正常');
      assert(rToday.date === '2026-06-01', 'cmdToday 返回正确日期');

      const rList = cmdList();
      assert(!rList.error, 'cmdList 正常');
      assert(Array.isArray(rList.trips), 'cmdList 返回 trips 数组');

      const rSelect = cmdSelect('古蜀道');
      assert(!rSelect.error, 'cmdSelect 正常');

      const rRoutes = cmdSetHikingRoutes([{ name: '剑门关徒步', distance: '10km', ascent: 300 }], tripId);
      assert(!rRoutes.error, 'cmdSetHikingRoutes 正常');

      const rCulture = cmdSetCulture({ history: '测试历史' }, tripId);
      assert(!rCulture.error, 'cmdSetCulture 正常');

      const rNode = cmdSetDayNode(0, { time: '08:00', type: 'hiking', name: '测试节点' }, tripId);
      assert(!rNode.error, 'cmdSetDayNode 正常');

      const rBadAdd = cmdAddDay('day99', '测试', tripId);
      assert(rBadAdd.error && rBadAdd.error.includes('无效'), 'cmdAddDay 无效 day 参数正确报错');

      const rBadDel = cmdDelDay('day99', tripId);
      assert(rBadDel.error && rBadDel.error.includes('无效'), 'cmdDelDay 无效 day 参数正确报错');

      const rBadReorder = cmdReorderDay('day1', 'invalid', 'day2', tripId);
      assert(rBadReorder.error && rBadReorder.error.includes('无效'), 'cmdReorderDay 无效操作正确报错');
    }

  } finally {
    cleanup();
  }

  // ── 最终报告 ─────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════╗');
  console.log(`║  测试结果: ${passed} 通过 / ${failed} 失败`);
  console.log('╚══════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n⚠️  测试未全部通过');
    process.exit(1);
  } else {
    console.log('\n✅ 所有测试通过 — PASS');
    process.exit(0);
  }
}

runTests();
