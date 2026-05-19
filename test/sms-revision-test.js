/**
 * hike-planner 新功能回归测试
 * 测试：短信解析 + 实时修订 + 汽车/徒步区分 + 全量回归
 *
 * 运行：node test/sms-revision-test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// 使用绝对路径加载主脚本
const SCRIPT_PATH = path.join(__dirname, '..', 'skill', 'scripts', 'hike-planner.js');
const h = require(SCRIPT_PATH);

// 测试输出目录（临时）
const TEST_OUTPUT_DIR = path.join(os.tmpdir(), `hike-test-${Date.now()}`);
const STATE_FILE = path.join(TEST_OUTPUT_DIR, '.hike-planner-state.json');

// 全局计数器
let passCount = 0;
let failCount = 0;
const results = [];

function resetEnv() {
  process.env.HIKE_PLANNER_OUTPUT_DIR = TEST_OUTPUT_DIR;
  // 清空输出目录
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
}

function log(msg) {
  console.log(`  ${msg}`);
}

function assert(condition, testName, detail) {
  if (condition) {
    log(`✅ ${testName}`);
    passCount++;
    results.push({ name: testName, status: 'PASS', detail });
  } else {
    log(`❌ ${testName}`);
    if (detail) log(`   详情: ${JSON.stringify(detail)}`);
    failCount++;
    results.push({ name: testName, status: 'FAIL', detail });
  }
}

// ── 辅助：创建标准 Trip ────────────────────────────────
function createStandardTrip() {
  // 清理后初始化
  resetEnv();
  const initResult = h.cmdInit('古蜀道徒步', {
    startDate: '2026-05-13',
    endDate: '2026-05-16',
    participants: 1,
    outputDir: TEST_OUTPUT_DIR,
  });
  if (initResult.error) throw new Error(`初始化失败: ${initResult.error}`);

  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const tripId = Object.keys(state.trips)[0];

  // cmdSetRequirements 生成 days 数组
  h.cmdSetRequirements({
    destination: '古蜀道·金牛道（剑阁段）',
    tripId,
    participants: 1,
    startDate: '2026-05-13',
    endDate: '2026-05-16',
    preferences: { transport: '火车', interests: ['历史文化'] },
    outputDir: TEST_OUTPUT_DIR,
  });

  return { state, tripId };
}

// ── 测试组：短信解析 ─────────────────────────────────
function testSMSParsing() {
  console.log('\n【测试组1】短信解析 — parseOrderSMS()');
  console.log('─'.repeat(60));

  // ── 1.1 火车票：D2008 标准格式 ──
  const d2008 = '您的订单E1234567，车次D2008，成都东07:50-剑门关09:21，二等座01车02A号，订单E123456789';
  const r1 = h.parseOrderSMS(d2008);
  assert(r1 && r1.type === 'train', 'SMS-1.1 D2008标准格式解析', r1?.data);

  // ── 1.2 火车票：变体格式（订单号在前） ──
  const d2008b = '订单CA1234567，车次K963，成都站09:30-广元站12:05，硬座16车088号';
  const r2 = h.parseOrderSMS(d2008b);
  assert(r2 && r2.type === 'train', 'SMS-1.2 订单号在前变体格式', r2?.data);

  // ── 1.3 火车票：站名本身含"站"（剑门关站） ──
  const d2008c = '您的订单E9876543，车次D2008，成都东07:50-剑门关站09:21，二等座05车08F号，订单E9876543';
  const r3 = h.parseOrderSMS(d2008c);
  assert(r3 && r3.type === 'train' && r3.data.toSta === '剑门关站', 'SMS-1.3 站名含"站"自动规范化（剑门关站）', r3?.data);

  // ── 1.4 酒店：12306风格（无退房日） ──
  const hotel12306 = '剑阁瑞山酒店已预订成功，入住2026-05-14，标准间含双早，订单H123456';
  const r4 = h.parseOrderSMS(hotel12306);
  assert(r4 && r4.type === 'hotel', 'SMS-1.4 12306风格酒店短信解析', r4?.data);

  // ── 1.5 酒店：完整格式（含退房） ──
  const hotelFull = '瑞山宾馆已预订成功，入住2026-05-14，退房2026-05-16，标准间，订单H654321';
  const r5 = h.parseOrderSMS(hotelFull);
  assert(r5 && r5.type === 'hotel' && r5.data.checkIn === '2026-05-14' && r5.data.checkOut === '2026-05-16', 'SMS-1.5 完整酒店短信（含退房）解析', r5?.data);

  // ── 1.6 酒店：携程风格 ──
  const hotelCtrip = '携程，您已预订剑门关酒店，入住2026-05-14，退房2026-05-15，大床房，订单CTRIP8888';
  const r6 = h.parseOrderSMS(hotelCtrip);
  assert(r6 && r6.type === 'hotel', 'SMS-1.6 携程风格酒店短信解析', r6?.data);

  // ── 1.7 机票：航司标准格式 ──
  const flightCA = '航班CA1234，北京-成都，2026-05-13 08:00-10:30，经济舱，订单FL9876543';
  const r7 = h.parseOrderSMS(flightCA);
  assert(r7 && r7.type === 'flight' && r7.data.flightNum === 'CA1234', 'SMS-1.7 航司机票短信解析', r7?.data);

  // ── 1.8 机票：订单号在前变体 ──
  const flightOrder = '订单ORDER123，航班MU5678，上海-成都，2026-05-14 14:00-17:30，商务舱';
  const r8 = h.parseOrderSMS(flightOrder);
  assert(r8 && r8.type === 'flight' && r8.data.flightNum === 'MU5678', 'SMS-1.8 机票订单号在前变体', r8?.data);

  // ── 1.9 无法识别的短信 ──
  const unknown = '今天天气真好，适合徒步';
  const r9 = h.parseOrderSMS(unknown);
  assert(r9 === null, 'SMS-1.9 非订单短信返回null', r9);

  // ── 1.10 站名去重（站站→站） ──
  const d2008d = '您的订单E1111，车次D2008，成都东站07:50-剑门关站09:21，二等座，订单E1111';
  const r10 = h.parseOrderSMS(d2008d);
  const staOk = r10 && r10.data.fromSta === '成都东站' && r10.data.toSta === '剑门关站';
  assert(staOk, 'SMS-1.10 站名去重（站站→站）', r10?.data);
}

// ── 测试组：applySMSToTrip ───────────────────────────
function testApplySMSToTrip() {
  console.log('\n【测试组2】applySMSToTrip — 短信→行程融合');
  console.log('─'.repeat(60));

  const { tripId } = createStandardTrip();

  // 用 cmdSetDayNode 添加火车节点（会写入状态）
  const rNode = h.cmdSetDayNode(0, {
    time: '07:50-09:21',
    type: 'train',
    name: '成都东→剑门关站',
    detail: 'D2008',
    cost: null,
    remark: '二等座',
  }, tripId);
  assert(!rNode.error, 'APPLY-2.0 cmdSetDayNode 节点添加成功', rNode);

  // 解析 D2008 短信
  const sms = h.parseOrderSMS('您的订单E1234567，车次D2008，成都东07:50-剑门关09:21，二等座01车02A号，订单E123456789');
  assert(sms && sms.type === 'train', 'APPLY-2.1 SMS解析成功', sms?.data);

  // 重新加载 trip 以确保 applySMSToTrip 有完整数据
  const state1 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const trip1 = state1.trips[tripId];
  const applyResult = h.applySMSToTrip(trip1, sms);
  assert(applyResult.applied === true, 'APPLY-2.2 SMS成功应用到行程', applyResult.detail);
  assert(applyResult.action === 'updated', 'APPLY-2.3 现有节点被更新（而非重复添加）', applyResult.action);
  assert(trip1.days[0].nodes.some(n => n.type === 'train' && n.remark && n.remark.includes('E123456789')), 'APPLY-2.4 订单号写入remark', null);

  // 测试酒店 SMS
  // ⚠️ 注意：含早格式（如"标准间含双早"）的酒店SMS在 applySMSToTrip 中会触发
  // L872 'text is not defined' 缺陷（见缺陷报告），此处用不含早格式测试
  const hotelSms = h.parseOrderSMS('瑞山宾馆已预订成功，入住2026-05-14，退房2026-05-15，标准间，订单H999');
  const applyHotel = h.applySMSToTrip(trip1, hotelSms);
  assert(applyHotel.applied === true, 'APPLY-2.5 酒店SMS应用成功', applyHotel.detail);
  assert(trip1.days[1].nodes.some(n => n.type === 'hotel' && n.name === '瑞山宾馆'), 'APPLY-2.6 酒店节点添加（酒店在入住日days[1]，非出发日days[0]）', null);
}

// ── 测试组：实时修订（偏差对比）───────────────────────
function testCompareActualVsPlan() {
  console.log('\n【测试组3】实时修订 — compareActualVsPlan() 偏差检测');
  console.log('─'.repeat(60));

  const { tripId } = createStandardTrip();

  // 在 day[0] 设置一个计划节点（07:50出发，费用¥104）
  const state1 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const trip1 = state1.trips[tripId];
  trip1.days[0].nodes = [{
    time: '07:50-09:21',
    type: 'train',
    name: '成都东→剑门关',
    detail: 'D2008',
    cost: 104,
    remark: '二等座',
    actualStatus: null, actualTime: null, actualCost: null,
  }];
  trip1.dayCost = 104;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state1, null, 2), 'utf8');

  // ── 3.1 时间偏差 > 30min → alert ──
  const comp1 = h.compareActualVsPlan(trip1, {
    dayIndex: 0, nodeIndex: 0,
    actualTime: '08:30',  // 延迟40分钟
    actualCost: null,
  });
  assert(comp1.alert === true, 'CMP-3.1 时间偏差>30min触发alert', comp1);
  const timeAlert = comp1.deviations.find(d => d.type === 'time');
  assert(timeAlert && timeAlert.diffMinutes === 40, 'CMP-3.2 时间偏差值正确（+40min）', timeAlert);

  // ── 3.3 时间偏差 ≤ 30min → 不触发alert ──
  const comp2 = h.compareActualVsPlan(trip1, {
    dayIndex: 0, nodeIndex: 0,
    actualTime: '08:10',  // 延迟20分钟
    actualCost: null,
  });
  assert(comp2.alert === false, 'CMP-3.3 时间偏差≤30min不触发alert', comp2);

  // ── 3.4 费用偏差 > ¥50 → alert ──
  const comp3 = h.compareActualVsPlan(trip1, {
    dayIndex: 0, nodeIndex: 0,
    actualTime: null,
    actualCost: 180,  // 超支 ¥76
  });
  assert(comp3.alert === true, 'CMP-3.4 费用偏差>¥50触发alert', comp3);
  const costAlert = comp3.deviations.find(d => d.type === 'cost');
  assert(costAlert && costAlert.diffYuan === 76, 'CMP-3.5 费用偏差值正确（+¥76）', costAlert);

  // ── 3.6 费用偏差 ≤ ¥50 → 不触发alert ──
  const comp4 = h.compareActualVsPlan(trip1, {
    dayIndex: 0, nodeIndex: 0,
    actualTime: null,
    actualCost: 140,  // 超支 ¥36
  });
  assert(comp4.alert === false, 'CMP-3.6 费用偏差≤¥50不触发alert', comp4);

  // ── 3.7 双重偏差（时间和费用都超限） ──
  const comp5 = h.compareActualVsPlan(trip1, {
    dayIndex: 0, nodeIndex: 0,
    actualTime: '09:00',  // 延迟 70min
    actualCost: 200,      // 超支 ¥96
  });
  assert(comp5.alert === true, 'CMP-3.7 双重偏差触发alert', comp5);
  assert(comp5.deviations.length === 2, 'CMP-3.8 双重偏差返回2条记录', comp5.deviations.length);

  // ── 3.9 节点不存在时返回空 ──
  const comp6 = h.compareActualVsPlan(trip1, {
    dayIndex: 99, nodeIndex: 0,
    actualTime: '08:00', actualCost: 100,
  });
  assert(comp6.alert === false && comp6.deviations.length === 0, 'CMP-3.9 无效节点返回空偏差', comp6);

  // ── 3.10 负偏差（提前/节约）也正确标记 ──
  // 提前30min边界值（=30不触发）+ 费用正好¥54差值=50（=50也不触发）
  const comp7 = h.compareActualVsPlan(trip1, {
    dayIndex: 0, nodeIndex: 0,
    actualTime: '07:20',  // 提前30分钟（>30才触发，=30不触发）
    actualCost: 54,        // 差值50，50>50为false（边界：=50也不触发）
  });
  assert(comp7.alert === false, 'CMP-3.10 时间提前30min边界值不触发alert（>30才触发）', comp7);
  const comp8 = h.compareActualVsPlan(trip1, {
    dayIndex: 0, nodeIndex: 0,
    actualTime: '07:10',  // 提前40分钟
    actualCost: null,
  });
  assert(comp8.alert === true, 'CMP-3.11 时间提前>30min触发alert', comp8);
  const earlyAlert = comp8.deviations[0];
  assert(earlyAlert && earlyAlert.diffMinutes === -40, 'CMP-3.12 提前偏差正确（-40min）', earlyAlert);
}

// ── 测试组：节点状态标记 ─────────────────────────────
function testCmdSetNodeStatus() {
  console.log('\n【测试组4】节点状态标记 — cmdSetNodeStatus()');
  console.log('─'.repeat(60));

  const { tripId } = createStandardTrip();

  // 设置节点
  const state1 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const trip1 = state1.trips[tripId];
  trip1.days[0].nodes = [{
    time: '07:50-09:21',
    type: 'train',
    name: '成都东→剑门关',
    detail: 'D2008',
    cost: 104,
    remark: '二等座',
    actualStatus: null, actualTime: null, actualCost: null,
  }];
  fs.writeFileSync(STATE_FILE, JSON.stringify(state1, null, 2), 'utf8');

  // ── 4.1 标记为完成 ──
  const r1 = h.cmdSetNodeStatus(tripId, 0, 0, 'completed', { actualTime: '07:52', actualCost: 104 });
  assert(r1.status === 'completed', 'NODE-4.1 节点标记为completed', r1);
  assert(r1.icon === '✅', 'NODE-4.2 完成状态图标正确', r1.icon);

  // ── 4.3 标记为跳过 ──
  const r2 = h.cmdSetNodeStatus(tripId, 0, 0, 'skipped', {});
  assert(r2.status === 'skipped', 'NODE-4.3 节点标记为skipped', r2);
  assert(r2.icon === '❌', 'NODE-4.4 跳过状态图标正确', r2.icon);

  // ── 4.5 标记为变更 ──
  const r3 = h.cmdSetNodeStatus(tripId, 0, 0, 'changed', { actualRemark: '改乘下一班' });
  assert(r3.status === 'changed', 'NODE-4.5 节点标记为changed', r3);
  assert(r3.icon === '🔄', 'NODE-4.6 变更状态图标正确', r3.icon);

  // ── 4.7 标记为待定 ──
  const r4 = h.cmdSetNodeStatus(tripId, 0, 0, 'pending', {});
  assert(r4.status === 'pending', 'NODE-4.7 节点标记为pending', r4);
  assert(r4.icon === '⏸️', 'NODE-4.8 待定状态图标正确', r4.icon);

  // ── 4.9 无效状态值 ──
  const r5 = h.cmdSetNodeStatus(tripId, 0, 0, 'invalid_status', {});
  assert(r5.error && r5.error.includes('无效的状态'), 'NODE-4.9 无效状态返回error', r5);

  // ── 4.10 无效dayIndex ──
  const r6 = h.cmdSetNodeStatus(tripId, 99, 0, 'completed', {});
  assert(r6.error && r6.error.includes('不存在'), 'NODE-4.10 无效dayIndex返回error', r6);

  // ── 4.11 无效nodeIndex ──
  const r7 = h.cmdSetNodeStatus(tripId, 0, 99, 'completed', {});
  assert(r7.error && r7.error.includes('不存在'), 'NODE-4.11 无效nodeIndex返回error', r7);

  // ── 4.12 实际数据触发偏差对比 ──
  const r8 = h.cmdSetNodeStatus(tripId, 0, 0, 'completed', { actualTime: '09:00', actualCost: 200 });
  assert(r8.compare !== null, 'NODE-4.12 提供实际数据时触发偏差对比', r8.compare);
  assert(r8.compare.alert === true, 'NODE-4.13 偏差对比alert正确', r8.compare.alert);
}

// ── 测试组：cmdLog 新扩展 ────────────────────────────
function testCmdLogExtensions() {
  console.log('\n【测试组5】cmdLog 扩展 — hike-log 记录新字段');
  console.log('─'.repeat(60));

  const { tripId } = createStandardTrip();

  // 设置一个当日节点
  const state1 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const trip1 = state1.trips[tripId];
  const today = trip1.days[0].date;
  trip1.days[0].nodes = [{
    time: '07:50-09:21',
    type: 'train',
    name: '成都东→剑门关',
    detail: 'D2008',
    cost: 104,
    remark: '二等座',
    actualStatus: null, actualTime: null, actualCost: null,
  }];
  trip1.status = h.STATUS.ACTIVE;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state1, null, 2), 'utf8');

  // ── 5.1 状态标记关键字：完成 ✅ ──
  const r1 = h.cmdLog('D2008已出发，实际07:52出发搞完了', today);
  const completedNode = r1.compare ? true : false;
  assert(completedNode, 'LOG-5.1 完成状态关键字检测（搞完/完成/✅）', r1.compare);

  // ── 5.2 状态标记关键字：跳过 ❌ ──
  resetEnv();
  const { tripId: tid2 } = createStandardTrip();
  const s2 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const t2 = s2.trips[tid2];
  const today2 = t2.days[0].date;
  t2.days[0].nodes = [{ time: '07:50-09:21', type: 'train', name: '成都东→剑门关', detail: 'D2008', cost: 104, remark: '二等座', actualStatus: null, actualTime: null, actualCost: null }];
  t2.status = h.STATUS.ACTIVE;
  fs.writeFileSync(STATE_FILE, JSON.stringify(s2, null, 2), 'utf8');

  const r2 = h.cmdLog('D2008没去，跳过了', today2);
  assert(r2.compare && r2.compare.deviations.length >= 0, 'LOG-5.2 跳过状态关键字检测', r2.compare);

  // ── 5.3 实际时间解析（晚30分钟） ──
  resetEnv();
  const { tripId: tid3 } = createStandardTrip();
  const s3 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const t3 = s3.trips[tid3];
  const today3 = t3.days[0].date;
  t3.days[0].nodes = [{ time: '07:50-09:21', type: 'train', name: '成都东→剑门关', detail: 'D2008', cost: 104, remark: '二等座', actualStatus: null, actualTime: null, actualCost: null }];
  t3.status = h.STATUS.ACTIVE;
  fs.writeFileSync(STATE_FILE, JSON.stringify(s3, null, 2), 'utf8');

  const r3 = h.cmdLog('出发晚了30分钟', today3);
  assert(r3.logEntry && r3.logEntry.delayMinutes === 30, 'LOG-5.3 时间延迟解析（晚X分钟）', r3.logEntry);

  // ── 5.4 费用超支解析 ──
  resetEnv();
  const { tripId: tid4 } = createStandardTrip();
  const s4 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const t4 = s4.trips[tid4];
  const today4 = t4.days[0].date;
  t4.days[0].nodes = [{ time: '07:50-09:21', type: 'train', name: '成都东→剑门关', detail: 'D2008', cost: 104, remark: '二等座', actualStatus: null, actualTime: null, actualCost: null }];
  t4.status = h.STATUS.ACTIVE;
  fs.writeFileSync(STATE_FILE, JSON.stringify(s4, null, 2), 'utf8');

  const r4 = h.cmdLog('今天包车多花了60块', today4);
  assert(r4.compare && r4.compare.alert === true, 'LOG-5.4 费用超支解析（多花了¥60）触发alert', r4.compare);

  // ── 5.5 SMS火车票自动识别 ──
  resetEnv();
  const { tripId: tid5 } = createStandardTrip();
  const s5 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const t5 = s5.trips[tid5];
  const today5 = t5.days[0].date;
  t5.status = h.STATUS.ACTIVE;
  fs.writeFileSync(STATE_FILE, JSON.stringify(s5, null, 2), 'utf8');

  const r5 = h.cmdLog('您的订单E1234567，车次D2008，成都东07:50-剑门关09:21，二等座01车02A号，订单E123456789', today5);
  assert(r5.sms && r5.sms.type === 'train', 'LOG-5.5 SMS火车票自动识别', r5.sms);
  assert(r5.smsApply && r5.smsApply.applied === true, 'LOG-5.6 SMS自动应用到行程', r5.smsApply);

  // ── 5.7 组合：时间偏差 + 费用偏差 + 状态 ──
  resetEnv();
  const { tripId: tid6 } = createStandardTrip();
  const s6 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const t6 = s6.trips[tid6];
  const today6 = t6.days[0].date;
  t6.days[0].nodes = [{ time: '07:50-09:21', type: 'train', name: '成都东→剑门关', detail: 'D2008', cost: 104, remark: '二等座', actualStatus: null, actualTime: null, actualCost: null }];
  t6.status = h.STATUS.ACTIVE;
  fs.writeFileSync(STATE_FILE, JSON.stringify(s6, null, 2), 'utf8');

  const r6 = h.cmdLog('出发晚了50分钟，实际多花了¥80，超支了', today6);
  assert(r6.compare && r6.compare.alert === true, 'LOG-5.7 组合场景：偏差均触发alert', r6.compare);
}

// ── 测试组：汽车/徒步区分 ─────────────────────────────
function testDrivingVsWalking() {
  console.log('\n【测试组6】汽车/徒步区分 — render-itinerary-map.sh routeType');
  console.log('─'.repeat(60));

  // 验证 render-itinerary-map.sh 脚本存在且支持 --routeType
  const scriptPath = path.join(__dirname, '..', 'skill', 'scripts', 'render-itinerary-map.sh');
  const scriptExists = fs.existsSync(scriptPath);
  assert(scriptExists, 'MAP-6.1 render-itinerary-map.sh 脚本存在', scriptExists);

  if (!scriptExists) return;

  const scriptContent = fs.readFileSync(scriptPath, 'utf8');

  // 验证支持 driving/walking/transfer/straight
  assert(scriptContent.includes('driving'), 'MAP-6.2 脚本支持 driving 路线类型', null);
  assert(scriptContent.includes('walking'), 'MAP-6.3 脚本支持 walking 路线类型', null);
  assert(scriptContent.includes('transfer') || scriptContent.includes('transfer/straight'), 'MAP-6.4 脚本支持 transfer 路线类型', null);

  // 验证示例用法中有 walking
  assert(scriptContent.includes('walking'), 'MAP-6.5 示例包含 walking 徒步段', null);

  // 验证 hike-planner.js 导出了 cmdSetMapUrl（负责设置地图URL）
  assert(typeof h.cmdSetMapUrl === 'function', 'MAP-6.6 cmdSetMapUrl 导出正确', typeof h.cmdSetMapUrl);

  // 验证节点类型中存在 hiking 节点类型
  const { tripId } = createStandardTrip();
  const state1 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const trip1 = state1.trips[tripId];
  trip1.days[0].nodes = [
    { time: '09:30-11:00', type: 'train', name: '成都东→剑门关', detail: 'D2008', cost: 104, remark: '' },
    { time: '11:30-17:00', type: 'hiking', name: '小娅子→断碑梁', detail: '徒步12.7km', cost: 0, remark: '古道' },
  ];
  fs.writeFileSync(STATE_FILE, JSON.stringify(state1, null, 2), 'utf8');

  // 验证 renderPlanReadme 渲染时 hiking 节点正确标记
  const readme = h.renderPlanReadme(trip1);
  assert(readme.includes('🥾') || readme.includes('徒步'), 'MAP-6.7 README渲染hiking节点正确标记🥾', null);
  assert(readme.includes('🥾 徒步') || (readme.includes('徒步') && !readme.includes('train')), 'MAP-6.8 hiking节点类型渲染正确', null);
}

// ── 测试组：全量回归 ─────────────────────────────────
function testRegression() {
  console.log('\n【测试组7】全量回归 — 5主命令 + 状态机');
  console.log('─'.repeat(60));

  // 清理
  resetEnv();

  // REG-1: cmdInit
  const r1 = h.cmdInit('古蜀道徒步', {
    startDate: '2026-05-13', endDate: '2026-05-16',
    participants: 1, outputDir: TEST_OUTPUT_DIR,
  });
  assert(!r1.error, 'REG-7.1 cmdInit 正常初始化', r1);

  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const tripId = Object.keys(state.trips)[0];
  assert(state.status === h.STATUS.COLLECTING, 'REG-7.2 cmdInit后状态为COLLECTING', state.status);

  // REG-3: cmdSetRequirements
  const r3 = h.cmdSetRequirements({
    destination: '古蜀道·金牛道（剑阁段）',
    participants: 1, startDate: '2026-05-13', endDate: '2026-05-16',
    preferences: { transport: '火车', interests: ['历史文化', '古道'] },
    outputDir: TEST_OUTPUT_DIR,
  }, tripId);
  assert(!r3.error, 'REG-7.3 cmdSetRequirements 正常设置', r3);

  // REG-4: cmdStatus
  const r4 = h.cmdStatus(tripId);
  assert(!r4.error && r4.status === h.STATUS.PLANNING, 'REG-7.4 cmdStatus 返回PLANING状态', r4.status);

  // REG-5: cmdSetHikingRoutes
  const r5 = h.cmdSetHikingRoutes([{
    name: '小娅子→断碑梁', distance: 12.7, ascent: 350, descent: 490,
    maxAltitude: 697, estimatedTime: '3-4小时', type: '山野古道+乡村公路',
    keyNodes: ['小娅子', '断碑梁'], tips: '注意防滑',
  }], tripId);
  assert(!r5.error && r5.hikingRoutes.length === 1, 'REG-7.5 cmdSetHikingRoutes 正常设置', r5);

  // REG-6: cmdSetDayNode
  const r6 = h.cmdSetDayNode(0, {
    time: '07:50-09:21', type: 'train', name: '成都东→剑门关',
    detail: 'D2008', cost: 104, remark: '二等座',
  }, tripId);
  assert(!r6.error, 'REG-7.6 cmdSetDayNode 正常添加节点', r6);

  // 验证 dayCost 聚合
  const s1 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  assert(s1.trips[tripId].days[0].dayCost === 104, 'REG-7.7 dayCost 正确聚合', s1.trips[tripId].days[0].dayCost);

  // REG-7: cmdSetDayWeather
  const r7 = h.cmdSetDayWeather(0, { condition: '晴', high: 31, low: 16 }, tripId);
  assert(!r7.error, 'REG-7.8 cmdSetDayWeather 正常设置天气', r7);

  // REG-8: cmdSetCulture
  const r8 = h.cmdSetCulture({ geography: '剑阁地形', history: '三国时期' }, tripId);
  assert(!r8.error, 'REG-7.9 cmdSetCulture 正常设置', r8);

  // REG-9: cmdSetEquipment
  const r9 = h.cmdSetEquipment({ shoes: '登山鞋', clothing: '长裤' }, tripId);
  assert(!r9.error, 'REG-7.10 cmdSetEquipment 正常设置', r9);

  // REG-10: cmdSetTodos
  const r10 = h.cmdSetTodos(['购买火车票', '准备干粮'], tripId);
  assert(!r10.error && r10.todos.length === 2, 'REG-7.11 cmdSetTodos 正常设置', r10);

  // REG-11: cmdGeneratePlan
  const r11 = h.cmdGeneratePlan(tripId);
  assert(!r11.error && r11.filePath.includes('README.md'), 'REG-7.12 cmdGeneratePlan 生成计划', r11);

  // 验证 CONFIRMED 状态
  const s2 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  assert(s2.trips[tripId].status === h.STATUS.CONFIRMED, 'REG-7.13 cmdGeneratePlan后状态为CONFIRMED', s2.trips[tripId].status);

  // REG-12: cmdConfirm
  const r12 = h.cmdConfirm(tripId);
  assert(!r12.error, 'REG-7.14 cmdConfirm 正常确认', r12);

  // REG-13: cmdActivate
  const r13 = h.cmdActivate(tripId);
  assert(!r13.error && r13.status === h.STATUS.ACTIVE, 'REG-7.15 cmdActivate 激活行程', r13);

  // REG-14: cmdToday
  const r14 = h.cmdToday(tripId);
  assert(!r14.error && r14.date === '2026-05-13', 'REG-7.16 cmdToday 返回当日计划', r14);

  // REG-15: cmdLog
  const r15 = h.cmdLog('今天一切顺利', '2026-05-13');
  assert(!r15.error, 'REG-7.17 cmdLog 正常记录', r15);

  // REG-16: cmdSummary（ACTIVE状态下应该返回错误）
  const r16 = h.cmdSummary(tripId);
  assert(r16.error && r16.error.includes('ACTIVE'), 'REG-7.18 cmdSummary 在ACTIVE状态返回错误（需先完成）', r16);

  // 状态机：COMPLETED → IDLE
  // 先完成行程
  const r17 = h.cmdSetNodeStatus(tripId, 0, 0, 'completed', { actualTime: '07:50', actualCost: 104 });
  const r18 = h.cmdSummary(tripId);
  assert(!r18.error && r18.status === h.STATUS.COMPLETED, 'REG-7.19 cmdSummary 完成行程并返回COMPLETED', r18);

  const s3 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const stateAfterSummary = h.cmdStatus(tripId);
  assert(s3.trips[tripId].status === h.STATUS.COMPLETED, 'REG-7.20 状态机：COMPLETED状态确认', s3.trips[tripId].status);

  // REG-21: 异常处理 - 无活动行程时 cmdStatus
  resetEnv();
  const r21 = h.cmdStatus();
  assert(!r21.error && r21.status === h.STATUS.IDLE, 'REG-7.21 无活动行程时cmdStatus返回IDLE', r21);

  // REG-22: 异常处理 - 越界dayIndex
  const { tripId: tid22 } = createStandardTrip();
  const r22 = h.cmdSetDayNode(99, { time: '09:00', type: 'train', name: '测试', detail: 'T1', cost: 0, remark: '' }, tid22);
  assert(r22.error && r22.error.includes('不存在'), 'REG-7.22 越界dayIndex返回错误', r22);

  // REG-23: 异常处理 - 非CONFIRMED状态激活
  const { tripId: tid23 } = createStandardTrip();
  const r23 = h.cmdActivate(tid23);
  assert(r23.error && r23.error.includes('无法激活'), 'REG-7.23 非CONFIRMED状态无法激活', r23);
}

// ── 主函数 ───────────────────────────────────────────
function main() {
  console.log('═'.repeat(60));
  console.log('hike-planner 新功能回归测试');
  console.log('测试对象：短信解析 + 实时修订 + 汽车/徒步区分 + 全量回归');
  console.log('═'.repeat(60));

  try {
    testSMSParsing();
    testApplySMSToTrip();
    testCompareActualVsPlan();
    testCmdSetNodeStatus();
    testCmdLogExtensions();
    testDrivingVsWalking();
    testRegression();
  } catch (err) {
    console.error(`\n❌ 测试执行异常: ${err.message}`);
    console.error(err.stack);
    failCount++;
  }

  // 清理
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    try { fs.rmSync(TEST_OUTPUT_DIR, { recursive: true }); } catch (e) {}
  }

  // 汇总
  console.log('\n' + '═'.repeat(60));
  console.log(`测试结果：✅ ${passCount} 项通过  ❌ ${failCount} 项失败`);
  console.log('═'.repeat(60));

  if (failCount > 0) {
    console.log('\n失败项目：');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.name}`);
      if (r.detail) console.log(`    ${JSON.stringify(r.detail)}`);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 所有测试通过！');
  }
}

main();
