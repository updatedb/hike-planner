#!/bin/bash
#
# render-itinerary-map.sh
# 将行程节点渲染为高德地图可视化链接（纯 bash + curl，无需 npm）
#
# 用法:
#   bash scripts/render-itinerary-map.sh "姜庄子村|大海陀村" "" "" "北京市延庆区"
#   bash scripts/render-itinerary-map.sh "成都|广元|昭化古城" "" "" "四川省成都市,四川省广元市,四川省广元市"
#
# 参数:
#   $1: stops        行程节点列表（必填，中文名称，逗号或竖线分隔）
#   $2: city         城市范围（可选，同现有逻辑，仅在 regions 全部未提供时使用）
#   $3: route_types  各段路线类型（可选，逗号分隔，数量=节点数-1）
#                     支持: driving/walking/riding/transfer/straight
#                     默认: driving
#                     - 徒步段 → walking
#                     - 出租/包车/自驾 → driving
#                     - 公交段 → transfer 或 driving
#                     - 火车/飞机 → straight（直线）
#   $4: regions      各节点省市区县前缀列表（逗号分隔，数量=节点数）
#                     例如: "北京市延庆区,北京市延庆区,河北省赤城县"
#                     用于消除重名地点的定位歧义，优先级最高
#

AMAP_KEY="${AMAP_WEBSERVICE_KEY:-}"

if [ -z "$AMAP_KEY" ]; then
  echo "❌ 未找到高德 Web Service Key，请设置环境变量 AMAP_WEBSERVICE_KEY"
  exit 1
fi

STOPS_STR="${1:-}"
CITY="${2:-}"
ROUTE_TYPES_STR="${3:-}"
REGIONS_STR="${4:-}"

if [ -z "$STOPS_STR" ]; then
  echo "❌ 缺少参数: stops（节点列表）"
  echo ""
  echo "用法:"
  echo "  bash scripts/render-itinerary-map.sh \"姜庄子村|大海陀村\" \"\" \"\" \"北京市延庆区\""
  echo "  bash scripts/render-itinerary-map.sh \"成都|广元|昭化古城\" \"\" \"\" \"四川省成都市,四川省广元市,四川省广元市\""
  echo ""
  echo "参数1: 行程节点（必填，中文名称，逗号或竖线分隔）"
  echo "参数2: 城市范围（可选，仅在参数4未提供时兜底）"
  echo "参数3: 各段路线类型（可选，逗号分隔，默认 driving）"
  echo "参数4: 各节点省市区县前缀（可选，逗号分隔，用于消除重名定位歧义，推荐）"
  echo ""
  echo "示例 - 海坨山徒步:"
  echo "  bash scripts/render-itinerary-map.sh \"姜庄子村|小海坨|大海陀村\" \"延庆\" \"walking,walking\" \"北京市延庆区,北京市延庆区,河北省赤城县\""
  exit 1
fi

# 解析节点
IFS='|,' read -ra STOPS <<< "$STOPS_STR"
STOPS=("${STOPS[@]}")

# 解析路线类型
declare -a ROUTE_TYPES
if [ -n "$ROUTE_TYPES_STR" ]; then
  IFS=',' read -ra ROUTE_TYPES <<< "$ROUTE_TYPES_STR"
fi

# 解析各节点区域前缀
declare -a REGIONS
if [ -n "$REGIONS_STR" ]; then
  IFS=',' read -ra REGIONS <<< "$REGIONS_STR"
fi

if [ ${#STOPS[@]} -lt 2 ]; then
  echo "❌ 节点数量不足，至少需要 2 个节点"
  exit 1
fi

echo ""
echo "🗺️  正在渲染行程地图..."
echo "⚠️  隐私提示：行程站点名称将通过网络发送给高德地图（Amap）API 进行地理编码。"
echo "📍 节点数量: ${#STOPS[@]}"
[ -n "$REGIONS_STR" ] && echo "📍 定位范围: $REGIONS_STR"
[ -n "$CITY" ] && [ -z "$REGIONS_STR" ] && echo "📍 城市范围: $CITY"
echo ""

declare -a COORDS
declare -a NAMES

# 地理编码每个节点
for i in "${!STOPS[@]}"; do
  NAME="${STOPS[$i]}"
  # 获取该节点的区域前缀（优先级最高）
  NODE_REGION="${REGIONS[$i]:-}"
  echo -n "  [$((i+1))/${#STOPS[@]}] 地理编码: $NAME ... "

  LOCATION=""

  # 策略1（最高优先级）：省市区县前缀 + 节点名，消除重名歧义
  if [ -n "$NODE_REGION" ]; then
    LOCATION=$(curl -s "https://restapi.amap.com/v3/geocode/geo?address=$(echo "${NODE_REGION}${NAME}" | sed 's/ /%20/g')&output=json&key=$AMAP_KEY" | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('geocodes',[{}])[0].get('location',''))" 2>/dev/null || echo "")
    [ -n "$LOCATION" ] && echo -n "[精确] "
  fi

  # 策略2：城市前缀 + 节点名（现有逻辑，regions 未命中时兜底）
  if [ -z "$LOCATION" ] && [ -n "$CITY" ]; then
    LOCATION=$(curl -s "https://restapi.amap.com/v3/geocode/geo?address=$(echo "${CITY}${NAME}" | sed 's/ /%20/g')&output=json&key=$AMAP_KEY" | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('geocodes',[{}])[0].get('location',''))" 2>/dev/null || echo "")
    [ -n "$LOCATION" ] && echo -n "[城市] "
  fi

  # 策略3：仅节点名（兜底）
  if [ -z "$LOCATION" ]; then
    LOCATION=$(curl -s "https://restapi.amap.com/v3/geocode/geo?address=$(echo "$NAME" | sed 's/ /%20/g')&output=json&key=$AMAP_KEY" | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('geocodes',[{}])[0].get('location',''))" 2>/dev/null || echo "")
    [ -n "$LOCATION" ] && echo -n "[兜底] "
  fi

  # 策略4：节点名 + 常见后缀
  if [ -z "$LOCATION" ]; then
    for SUFFIX in "景区" "古镇" "古城" "国家公园" "自然保护区"; do
      [ -n "$LOCATION" ] && break
      LOCATION=$(curl -s "https://restapi.amap.com/v3/geocode/geo?address=$(echo "${NAME}${SUFFIX}" | sed 's/ /%20/g')&output=json&key=$AMAP_KEY" | \
        python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('geocodes',[{}])[0].get('location',''))" 2>/dev/null || echo "")
    done
    [ -n "$LOCATION" ] && echo -n "[后缀] "
  fi

  if [ -n "$LOCATION" ]; then
    LNG=$(echo "$LOCATION" | cut -d',' -f1)
    LAT=$(echo "$LOCATION" | cut -d',' -f2)
    COORDS+=("$LNG,$LAT")
    NAMES+=("$NAME")
    echo "✅ $LOCATION"
  else
    echo "⚠️  未找到（跳过）"
  fi
done

if [ ${#COORDS[@]} -lt 2 ]; then
  echo ""
  echo "❌ 有效坐标不足，无法生成路线图"
  exit 1
fi

# 获取本段路线类型
get_route_type() {
  local idx=$1
  if [ -n "${ROUTE_TYPES[$idx]}" ]; then
    echo "${ROUTE_TYPES[$idx]}"
  else
    echo "driving"
  fi
}

# 构建 mapTaskData JSON（POI → Route → POI → Route... 交替顺序）
JSON_CHUNKS=""
for i in "${!COORDS[@]}"; do
  LNG=$(echo "${COORDS[$i]}" | cut -d',' -f1)
  LAT=$(echo "${COORDS[$i]}" | cut -d',' -f2)
  [ -n "$JSON_CHUNKS" ] && JSON_CHUNKS+=","
  JSON_CHUNKS+="{\"type\":\"poi\",\"lnglat\":[$LNG,$LAT],\"sort\":\"第$((i+1))站\",\"text\":\"${NAMES[$i]}\",\"remark\":\"\"}"

  if [ $i -lt $((${#COORDS[@]} - 1)) ]; then
    NEXT=$((i+1))
    SLNG=$(echo "${COORDS[$i]}" | cut -d',' -f1)
    SLAT=$(echo "${COORDS[$i]}" | cut -d',' -f2)
    ELNG=$(echo "${COORDS[$NEXT]}" | cut -d',' -f1)
    ELAT=$(echo "${COORDS[$NEXT]}" | cut -d',' -f2)
    RT=$(get_route_type $i)
    REMARK="第$((i+1))段: ${NAMES[$i]} → ${NAMES[$NEXT]}"
    JSON_CHUNKS+=",{\"type\":\"route\",\"routeType\":\"$RT\",\"start\":[$SLNG,$SLAT],\"end\":[$ELNG,$ELAT],\"remark\":\"$REMARK\"}"
  fi
done

FINAL_JSON="[$JSON_CHUNKS]"
ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.stdin.read()))" <<< "$FINAL_JSON")
MAP_LINK="https://a.amap.com/jsapi_demo_show/static/openclaw/travel_plan.html?data=$ENCODED"

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "✅ 行程地图生成成功！"
echo ""
echo "📋 数据摘要:"
for i in "${!NAMES[@]}"; do
  echo "   $((i+1)). ${NAMES[$i]} (${COORDS[$i]})"
done
echo ""
echo "🔗 地图链接:"
echo ""
echo "   $MAP_LINK"
echo ""
echo "════════════════════════════════════════════════════════════════════"
