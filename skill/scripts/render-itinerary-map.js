#!/usr/bin/env node
/**
 * render-itinerary-map.js
 * 将行程节点渲染为高德地图可视化链接
 * 使用 curl（无 npm 依赖）
 *
 * 用法:
 * node scripts/render-itinerary-map.js --stops="成都|广元|昭化古城|明月峡|剑阁县" [--city=广元] [--region=四川省广元市] [--routeType=driving]
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 高德 Web Service Key 读取
// 仅从环境变量或全局配置读取，不跨 skill 读取凭据
function getAmapKey() {
  const envKey = process.env.AMAP_WEBSERVICE_KEY;
  if (envKey) return envKey;

  return null;
}

// 地理编码：调用高德 API
// region 为省市区县前缀，用于消除重名歧义（如 "北京市延庆区" 确保 "姜庄子村" 定位到正确的那个）
async function geocode(address, key, region) {
  // 优先用 region+address 精确定位，排除重名干扰
  const fullAddress = region ? `${region}${address}` : address;
  const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(fullAddress)}&output=json&key=${key}&city=${encodeURIComponent(region || '')}`;
  try {
    const res = execSync(`curl -s "${url}"`, { timeout: 10000 });
    const data = JSON.parse(res.toString());
    if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
      const loc = data.geocodes[0].location; // "经度,纬度"
      return loc.split(',').map(Number); // [lng, lat]
    }
    // 带 region 前缀匹配失败时，尝试不带前缀
    if (region) {
      const fallbackUrl = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&output=json&key=${key}`;
      const fallbackRes = execSync(`curl -s "${fallbackUrl}"`, { timeout: 10000 });
      const fallbackData = JSON.parse(fallbackRes.toString());
      if (fallbackData.status === '1' && fallbackData.geocodes && fallbackData.geocodes.length > 0) {
        const loc = fallbackData.geocodes[0].location;
        return loc.split(',').map(Number);
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// 解析命令行参数
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      args[key] = value || true;
    }
  });
  return args;
}

// ── 直接坐标模式：从 GPX/KML 提取的 GPS 坐标无需地理编码 ──

/**
 * 使用直接 GPS 坐标渲染地图（无需地理编码，精度最高）
 */
async function renderWithCoords(args, key) {
  const rawCoords = args.coords.includes('|')
    ? args.coords.split('|')
    : args.coords.split(',');
  const coords = rawCoords.map(s => {
    const parts = s.trim().split(',');
    return [parseFloat(parts[0]), parseFloat(parts[1])];
  }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));

  const rawNames = (args.names || '').includes('|')
    ? args.names.split('|')
    : (args.names || '').split(',');
  const names = rawNames.map(s => s.trim()).filter(Boolean);

  if (coords.length < 2) {
    console.error('\n❌ 有效坐标不足，无法生成路线图');
    process.exit(1);
  }

  const routeType = args.routeType || 'driving';
  console.log(`\n🗺️  正在渲染行程地图（GPS 直连模式，无需地理编码）...`);
  console.log(`📍 GPS 坐标点: ${coords.length}`);
  console.log(`🛣️  路线类型: ${routeType}\n`);

  const mapTaskData = [];
  for (let i = 0; i < coords.length; i++) {
    const name = names[i] || `节点${i + 1}`;
    console.log(`  [${i + 1}/${coords.length}] ${name}: ${coords[i][0].toFixed(4)}, ${coords[i][1].toFixed(4)}`);
    mapTaskData.push({
      type: 'poi',
      lnglat: coords[i],
      sort: `第${i + 1}站`,
      text: name,
      remark: 'GPX/KML 实测坐标'
    });
  }

  for (let i = 0; i < mapTaskData.length - 1; i++) {
    const start = mapTaskData[i];
    const end = mapTaskData[i + 1];
    mapTaskData.push({
      type: 'route',
      routeType: routeType,
      start: start.lnglat,
      end: end.lnglat,
      remark: `第${i + 1}段: ${start.text} → ${end.text}`
    });
  }

  const baseUrl = 'https://a.amap.com/jsapi_demo_show/static/openclaw/travel_plan.html';
  const dataStr = encodeURIComponent(JSON.stringify(mapTaskData));
  const mapLink = `${baseUrl}?data=${dataStr}`;

  console.log('\n' + '═'.repeat(70));
  console.log('\n✅ 行程地图生成成功！（GPS 直连模式）\n');
  console.log('📋 数据摘要:');
  mapTaskData.filter(d => d.type === 'poi').forEach((poi, i) => {
    console.log(`   ${i + 1}. ${poi.text} (${poi.lnglat[0].toFixed(4)}, ${poi.lnglat[1].toFixed(4)}) ${poi.remark}`);
  });
  console.log(`\n🔗 地图链接:\n   ${mapLink}\n`);
  console.log('═'.repeat(70));

  if (process.env.OUTPUT_JSON) {
    console.log('\n---JSON---');
    console.log(JSON.stringify({ mapTaskData, mapLink }, null, 2));
  }
}

// 主函数
async function main() {
  const args = parseArgs();

  // ── GPS 直连模式（GPX/KML 提取的坐标，最高精度） ──
  if (args.coords) {
    if (!args.names) {
      console.error('❌ --coords 需要配合 --names 使用');
      console.log('用法: node render-itinerary-map.js --coords="115.4,40.2|115.5,40.3" --names="起点|终点"');
      process.exit(1);
    }
    const key = getAmapKey();
    if (!key) {
      console.error('❌ 未找到高德 Web Service Key');
      console.log('请设置环境变量: export AMAP_WEBSERVICE_KEY=你的Key');
      process.exit(1);
    }
    return renderWithCoords(args, key);
  }

  if (!args.stops) {
    console.error('❌ 缺少参数: --stops（节点列表，逗号或竖线分隔）');
    console.log('\n用法:');
    console.log('node render-itinerary-map.js --stops="成都,广元,昭化古城" [--city=广元] [--region=四川省广元市] [--routeType=driving]');
    console.log('node render-itinerary-map.js --coords="115.4,40.2|115.5,40.3" --names="起点|终点" [--routeType=driving]');
    console.log('\n地理编码模式参数:');
    console.log('  --stops     行程节点列表（必填，中文名称，用逗号或竖线分隔）');
    console.log('  --city       城市范围，用于提高地理编码精度（可选）');
    console.log('  --region     省市区县前缀（如 北京市延庆区），用于消除重名歧义（推荐）');
    console.log('  --routeType  路线类型: driving/walking/riding/transfer（默认: driving）');
    console.log('\nGPS 直连模式参数（GPX/KML）：');
    console.log('  --coords     GPS坐标列表（lng,lat 格式，用竖线或逗号分隔，无需地理编码）');
    console.log('  --names      对应的节点名称列表（用竖线或逗号分隔）');
    process.exit(1);
  }

  const key = getAmapKey();
  if (!key) {
    console.error('❌ 未找到高德 Web Service Key');
    console.log('请设置环境变量: export AMAP_WEBSERVICE_KEY=你的Key');

    process.exit(1);
  }

  const rawStops = args.stops.includes('|')
    ? args.stops.split('|')
    : args.stops.split(',');
  const stops = rawStops.map(s => s.trim()).filter(Boolean);
  const routeType = args.routeType || 'driving';
  const region = args.region || '';

  if (stops.length < 2) {
    console.error('❌ 节点数量不足，至少需要 2 个节点');
    process.exit(1);
  }

  console.log(`\n🗺️  正在渲染行程地图...`);
  console.log(`⚠️  隐私提示：行程站点名称将通过网络发送给高德地图（Amap）API 进行地理编码。`);
  console.log(`📍 节点数量: ${stops.length}`);
  if (region) console.log(`📍 定位范围: ${region}`);
  console.log(`🛣️  路线类型: ${routeType}\n`);

  const mapTaskData = [];

  // 逐个地理编码并添加 POI 标记
  for (let i = 0; i < stops.length; i++) {
    const name = stops[i];
    process.stdout.write(`  [${i + 1}/${stops.length}] 地理编码: ${name} ... `);
    const coord = await geocode(name, key, region);
    if (coord) {
      mapTaskData.push({
        type: 'poi',
        lnglat: coord,
        sort: `第${i + 1}站`,
        text: name,
        remark: ''
      });
      console.log(`✅ ${coord[0].toFixed(4)}, ${coord[1].toFixed(4)}`);
    } else {
      console.log(`⚠️  未找到坐标`);
    }
  }

  if (mapTaskData.length < 2) {
    console.error('\n❌ 有效坐标不足，无法生成路线图');
    process.exit(1);
  }

  // 添加路线段（相邻节点之间）
  for (let i = 0; i < mapTaskData.length - 1; i++) {
    const start = mapTaskData[i];
    const end = mapTaskData[i + 1];
    mapTaskData.push({
      type: 'route',
      routeType: routeType,
      start: start.lnglat,
      end: end.lnglat,
      remark: `第${i + 1}段: ${start.text} → ${end.text}`
    });
  }

  // 生成可视化链接
  const baseUrl = 'https://a.amap.com/jsapi_demo_show/static/openclaw/travel_plan.html';
  const dataStr = encodeURIComponent(JSON.stringify(mapTaskData));
  const mapLink = `${baseUrl}?data=${dataStr}`;

  console.log('\n' + '═'.repeat(70));
  console.log('\n✅ 行程地图生成成功！\n');
  console.log('📋 数据摘要:');
  mapTaskData.filter(d => d.type === 'poi').forEach((poi, i) => {
    console.log(`   ${i + 1}. ${poi.text} (${poi.lnglat[0].toFixed(4)}, ${poi.lnglat[1].toFixed(4)})`);
  });
  console.log(`\n🔗 地图链接:\n   ${mapLink}\n`);
  console.log('═'.repeat(70));

  if (process.env.OUTPUT_JSON) {
    console.log('\n---JSON---');
    console.log(JSON.stringify({ mapTaskData, mapLink }, null, 2));
  }
}

main().catch(err => {
  console.error('\n❌ 执行失败:', err.message);
  process.exit(1);
});
