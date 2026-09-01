import React, { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import Svg, { Path, Circle, Line, G, Text as SvgText } from "react-native-svg";

// ---------- Bar Chart (day sales / revenue / profit) ----------
export function BarChart({
  data,
  color = "#111827",
  height = 140,
  showValues = false,
}: {
  data: Array<{ label: string; value: number }>;
  color?: string;
  height?: number;
  showValues?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View className="flex-row items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => {
        const hPct = (d.value / max) * 100;
        return (
          <View key={i} className="flex-1 items-center gap-1.5">
            <View className="relative w-full items-center justify-end" style={{ height: height - 20 }}>
              {showValues && d.value > 0 ? (
                <Text className="text-[9px] font-bold text-gray-500 mb-1">{d.value > 1000 ? `${(d.value / 1000).toFixed(1)}k` : String(Math.round(d.value))}</Text>
              ) : null}
              <View
                style={{ height: `${Math.max(hPct, 6)}%`, backgroundColor: color, width: "100%", maxWidth: 28 }}
                className="rounded-full"
              />
            </View>
            <Text className="text-[10px] font-bold text-gray-500" numberOfLines={1}>
              {d.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ---------- Line Chart with switchable metric ----------
export function LineChart({
  data,
  color = "#111827",
  height = 160,
  width = 320,
}: {
  data: Array<{ label: string; value: number }>;
  color?: string;
  height?: number;
  width?: number;
}) {
  const padding = 16;
  const chartW = width - padding * 2;
  const chartH = height - 30;
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;

  // build path
  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = padding + chartH - ((d.value - min) / range) * chartH;
    return { x, y, label: d.label, value: d.value };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1]?.x ?? 0} ${padding + chartH} L ${points[0]?.x ?? 0} ${padding + chartH} Z`;

  return (
    <View className="bg-white rounded-xl overflow-hidden">
      <Svg width={width} height={height} className="bg-white">
        {/* grid */}
        {[0, 0.5, 1].map((t) => {
          const y = padding + chartH * t;
          return <Line key={t} x1={padding} y1={y} x2={padding + chartW} y2={y} stroke="#f3f4f6" strokeWidth={1} />;
        })}
        {/* area fill */}
        <Path d={areaD} fill={color} fillOpacity={0.08} />
        {/* line */}
        <Path d={pathD} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {/* dots */}
        {points.map((p, i) => (
          <G key={i}>
            <Circle cx={p.x} cy={p.y} r={10} fill={color} opacity={0.08} />
            <Circle cx={p.x} cy={p.y} r={3.5} fill={color} stroke="white" strokeWidth={2} />
          </G>
        ))}
      </Svg>
      <View className="flex-row justify-between px-2">
        {points.map((p, i) => (
          <Text key={i} className="text-[9px] font-bold text-gray-400" style={{ width: chartW / points.length, textAlign: "center" }}>
            {p.label.slice(0, 3)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function SwitchableLineCard({
  sales,
  revenue,
  profit,
}: {
  sales: Array<{ label: string; value: number }>;
  revenue: Array<{ label: string; value: number }>;
  profit: Array<{ label: string; value: number }>;
}) {
  const [metric, setMetric] = React.useState<"sales" | "revenue" | "profit">("revenue");
  const data = metric === "sales" ? sales : metric === "revenue" ? revenue : profit;
  const color = metric === "sales" ? "#111827" : metric === "revenue" ? "#0f766e" : "#1d4ed8";
  const label = metric === "sales" ? "Sales" : metric === "revenue" ? "Revenue" : "Profit";

  return (
    <View className="gap-3">
      <View className="flex-row bg-gray-100 rounded-full p-1 self-start">
        {(["sales", "revenue", "profit"] as const).map((m) => (
          <Pressable key={m} onPress={() => setMetric(m)} className={`px-3.5 py-1.5 rounded-full ${metric === m ? "bg-white border border-gray-200 shadow-sm" : ""}`}>
            <Text className={`text-xs font-bold capitalize ${metric === m ? "text-gray-900" : "text-gray-500"}`}>{m}</Text>
          </Pressable>
        ))}
      </View>
      <View className="bg-white rounded-xl border border-gray-200 p-2">
        <View className="flex-row justify-between items-center px-2 py-1">
          <Text className="text-xs font-bold tracking-widest text-gray-400 uppercase">{label} • week</Text>
          <Text className="text-xs font-bold text-gray-900">KES {Math.max(...data.map((d) => d.value)).toLocaleString("en-KE")}</Text>
        </View>
        <LineChart data={data} color={color} />
      </View>
    </View>
  );
}

// ---------- Pie Chart for categorical sales ----------
export function PieChart({
  data,
  size = 160,
}: {
  data: Array<{ name: string; value: number; color?: string }>;
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const palette = ["#111827", "#0f766e", "#1d4ed8", "#b45309", "#be185d", "#6d28d9", "#0e7490"];
  let acc = 0;
  const segments = data.map((d, i) => {
    const start = (acc / total) * 2 * Math.PI;
    acc += d.value;
    const end = (acc / total) * 2 * Math.PI;
    const largeArc = end - start > Math.PI ? 1 : 0;
    const r = size / 2 - 8;
    const cx = size / 2;
    const cy = size / 2;
    const x1 = cx + r * Math.cos(start - Math.PI / 2);
    const y1 = cy + r * Math.sin(start - Math.PI / 2);
    const x2 = cx + r * Math.cos(end - Math.PI / 2);
    const y2 = cy + r * Math.sin(end - Math.PI / 2);
    const color = d.color || palette[i % palette.length];
    const pct = (d.value / total) * 100;
    return { ...d, color, start, end, largeArc, x1, y1, x2, y2, pct, cx, cy, r };
  });

  return (
    <View className="flex-row items-center gap-4">
      <Svg width={size} height={size}>
        {segments.map((s, i) => {
          if (s.pct < 0.5) return null;
          const d = `M ${s.cx} ${s.cy} L ${s.x1} ${s.y1} A ${s.r} ${s.r} 0 ${s.largeArc} 1 ${s.x2} ${s.y2} Z`;
          return <Path key={i} d={d} fill={s.color} stroke="white" strokeWidth={2} />;
        })}
        <Circle cx={size / 2} cy={size / 2} r={size * 0.22} fill="white" />
        <G>
          <SvgText x={size / 2} y={size / 2 - 4} textAnchor="middle" fontSize={10} fontWeight="700" fill="#6b7280">TOTAL</SvgText>
          <SvgText x={size / 2} y={size / 2 + 10} textAnchor="middle" fontSize={11} fontWeight="800" fill="#111827">{total > 1000 ? `${(total / 1000).toFixed(1)}k` : String(Math.round(total))}</SvgText>
        </G>
      </Svg>
      <View className="flex-1 gap-2">
        {segments.slice(0, 5).map((s, i) => (
          <View key={i} className="flex-row items-center gap-2">
            <View style={{ backgroundColor: s.color }} className="w-2.5 h-2.5 rounded-full" />
            <Text className="text-xs font-semibold text-gray-900 flex-1" numberOfLines={1}>{s.name}</Text>
            <Text className="text-xs font-bold text-gray-600">{s.pct.toFixed(1)}%</Text>
          </View>
        ))}
        {segments.length > 5 && <Text className="text-xs text-gray-400">+{segments.length - 5} more</Text>}
      </View>
    </View>
  );
}
