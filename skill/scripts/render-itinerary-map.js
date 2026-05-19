#!/usr/bin/env node
/**
 * render-itinerary-map.js
 * 将行程节点渲染为高德地图可视化链接
 * 使用 curl（无 npm 依赖）
 *
 * 用法:
 * node scripts/render-itinerary-map.js --stops="成都|广元|昭化古城|明月峡|剑阁县" [--city=广元] [--routeType=driving]
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 高德 Web Service Key 读取
function getAmapKey() {
  const envKey = process.env.AMAP_WEBSERVICE_KEY;
  if (envKey) return envKey;

  const skillConfig = path.join(
    process.env.HOME || '/home/openclaw',
    '.openclaw/skills/amap-lbs-skill/config.json'
  );
  try {
    if (fs.existsSync(skillConfig)) {
      const cfg = JSON.parse(fs.readFileSync(skillConfig, 'utf8'));
      if (cfg.webServiceKey) return cfg.webServiceKey;
    }
  } catch (e) {}

  return null;
}

// 地理编码：调用高德 API
async function geocode(address, key) {
  const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&output=json&key=${key}`;
  try {
    const res = execSync(`curl -s "${url}"`, { timeout: 10000 });
    const data = JSON.parse(res.toString());
    if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
      const loc = data.geocodes[0].location; // "经度,纬度"
      return loc.split(',').map(Number); // [lng, lat]
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

// 主函数
async function main() {
  const args = parseArgs();

  if (!args.stops) {
    console.error('❌ 缺少参数: --stops（节点列表，逗号或竖线分隔）');
    console.log('\n用法:');
    console.log('node render-itinerary-map.js --stops="成都,广元,昭化古城" [--city=广元] [--routeType=driving]');
    console.log('\n参数:');
    console.log('  --stops     行程节点列表（必填，中文名称，用逗号或竖线分隔）');
    console.log('  --city       城市范围，用于提高地理编码精度（可选）');
    console.log('  --routeType  路线类型: driving/walking/riding/transfer（默认: driving）');
    process.exit(1);
  }

  const key = getAmapKey();
  if (!key) {
    console.error('❌ 未找到高德 Web Service Key');
    console.log('请设置环境变量: export AMAP_WEBSERVICE_KEY=你的Key');
    console.log('或配置: ~/.openclaw/skills/amap-lbs-skill/config.json');
    process.exit(1);
  }

  const rawStops = args.stops.includes('|')
    ? args.stops.split('|')
    : args.stops.split(',');
  const stops = rawStops.map(s => s.trim()).filter(Boolean);
  const routeType = args.routeType || 'driving';

  if (stops.length < 2) {
    console.error('❌ 节点数量不足，至少需要 2 个节点');
    process.exit(1);
  }

  console.log(`\n🗺️  正在渲染行程地图...\n`);
  console.log(`📍 节点数量: ${stops.length}`);
  console.log(`🛣️  路线类型: ${routeType}\n`);

  const mapTaskData = [];

  // 逐个地理编码并添加 POI 标记
  for (let i = 0; i < stops.length; i++) {
    const name = stops[i];
    process.stdout.write(`  [${i + 1}/${stops.length}] 地理编码: ${name} ... `);
    const coord = await geocode(name, key);
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
