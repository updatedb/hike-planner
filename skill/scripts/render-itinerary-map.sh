#!/bin/bash
#
# render-itinerary-map.sh
# 将行程节点渲染为高德地图可视化链接（纯 bash + curl，无需 npm）
#
# 用法:
#   bash scripts/render-itinerary-map.sh "成都|广元|昭化古城" "广元"
#   bash scripts/render-itinerary-map.sh "酒店|汉阳镇|普安镇" "" "driving,walking,driving"
#
# 参数:
#   $1: stops    行程节点列表（必填，中文名称，逗号或竖线分隔）
#   $2: city     城市范围（可选，提高地理编码精度）
#   $3: route_types  各段路线类型（可选，逗号分隔，数量=节点数-1）
#                 支持: driving/walking/riding/transfer/straight
#                 默认: driving
#                 - 徒步段 → walking
#                 - 出租/包车/自驾 → driving
#                 - 公交段 → transfer 或 driving
#                 - 火车/飞机 → straight（直线）
#

AMAP_KEY=""
for cfg in \
  "$HOME/.openclaw/skills/amap-lbs-skill/config.json" \
  "$HOME/.openclaw/config.json"; do
  if [ -f "$cfg" ]; then
    K=$(grep -o '"webServiceKey"[[:space:]]*:[[:space:]]*"[^"]*"' "$cfg" 2>/dev/null | head -1 | sed 's/.*"://;s/"//')
    [ -n "$K" ] && AMAP_KEY="$K" && break
  fi
done
AMAP_KEY="${AMAP_KEY:-${AMAP_WEBSERVICE_KEY:-}}"

if [ -z "$AMAP_KEY" ]; then
  echo "❌ 未找到高德 Web Service Key，请设置环境变量 AMAP_WEBSERVICE_KEY"
  exit 1
fi

STOPS_STR="${1:-}"
CITY="${2:-}"
ROUTE_TYPES_STR="${3:-}"

if [ -z "$STOPS_STR" ]; then
  echo "❌ 缺少参数: stops（节点列表）"
  echo ""
  echo "用法:"
  echo "  bash scripts/render-itinerary-map.sh \"成都|广元|昭化古城\""
  echo "  bash scripts/render-itinerary-map.sh \"酒店|汉阳镇|普安镇\" \"\" \"driving,walking,driving\""
  echo ""
  echo "参数1: 行程节点（必填，中文名称，逗号或竖线分隔）"
  echo "参数2: 城市范围（可选，提高地理编码精度）"
  echo "参数3: 各段路线类型（可选，逗号分隔，默认 driving）"
  echo "       徒步→walking  出租/包车→driving  公交→transfer  火车/飞机→straight"
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

if [ ${#STOPS[@]} -lt 2 ]; then
  echo "❌ 节点数量不足，至少需要 2 个节点"
  exit 1
fi

echo ""
echo "🗺️  正在渲染行程地图..."
echo "📍 节点数量: ${#STOPS[@]}"
[ -n "$ROUTE_TYPES_STR" ] && echo "🛣️  路线类型: $ROUTE_TYPES_STR"
echo ""

declare -a COORDS
declare -a NAMES

# 地理编码每个节点
for i in "${!STOPS[@]}"; do
  NAME="${STOPS[$i]}"
  echo -n "  [$((i+1))/${#STOPS[@]}] 地理编码: $NAME ... "

  LOCATION=""
  LOCATION=$(curl -s "https://restapi.amap.com/v3/geocode/geo?address=$(echo "$NAME" | sed 's/ /%20/g')&output=json&key=$AMAP_KEY" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('geocodes',[{}])[0].get('location',''))" 2>/dev/null || echo "")

  if [ -z "$LOCATION" ] && [ -n "$CITY" ]; then
    LOCATION=$(curl -s "https://restapi.amap.com/v3/geocode/geo?address=$(echo "${CITY}${NAME}" | sed 's/ /%20/g')&output=json&key=$AMAP_KEY" | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('geocodes',[{}])[0].get('location',''))" 2>/dev/null || echo "")
  fi

  if [ -z "$LOCATION" ]; then
    for SUFFIX in "景区" "古镇" "古城" "国家公园" "自然保护区"; do
      [ -z "$LOCATION" ] && LOCATION=$(curl -s "https://restapi.amap.com/v3/geocode/geo?address=$(echo "${NAME}${SUFFIX}" | sed 's/ /%20/g')&output=json&key=$AMAP_KEY" | \
        python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('geocodes',[{}])[0].get('location',''))" 2>/dev/null || echo "")
    done
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
