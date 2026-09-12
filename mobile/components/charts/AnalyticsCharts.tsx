import React from 'react'
import { View, Text, useWindowDimensions } from 'react-native'
import Svg, { Path, Circle, Line, G, Text as SvgText } from 'react-native-svg'
import { Tabs } from 'tamagui'

// ---------- Bar Chart (day sales / revenue / profit) ----------
export function BarChart({
  data,
  color = '#111827',
  height = 140,
  showValues = false,
}: {
  data: Array<{ label: string; value: number }>
  color?: string
  height?: number
  showValues?: boolean
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const min = Math.min(...data.map((d) => d.value), 0)
  const range = max - min || 1
  // y-tick for grid label
  const yTop = max
  const yMid = (max + min) / 2
  return (
    <View className='gap-2'>
      {/* y-scale */}
      <View className='flex-row justify-between px-1'>
        <Text className='text-xs font-bold text-gray-400'>{Math.round(yTop).toLocaleString('en-KE')}</Text>
        <Text className='text-xs text-gray-300'>KES</Text>
        <Text className='text-xs font-bold text-gray-400'>{Math.round(yMid).toLocaleString('en-KE')}</Text>
      </View>
      <View className='flex-row items-end gap-2' style={{ height }}>
        {data.map((d, i) => {
          const isZero = d.value === 0
          const hPct = (d.value - min) / range * 100
          const barHeight = isZero ? 2 : Math.max(hPct, 4)
          const isNegative = d.value < 0
          return (
            <View key={i} className='flex-1 items-center gap-1'>
              <View
                className='relative w-full items-center justify-end'
                style={{ height: height - 20 }}
              >
                {/* value label — always show for explicitness, 0 in muted, non-zero in strong */}
                <Text
                  className={`text-xs font-bold mb-1 ${isZero ? 'text-gray-300' : 'text-gray-600'}`}
                  numberOfLines={1}
                >
                  {showValues || isZero
                    ? d.value === 0
                      ? '0'
                      : d.value > 1000 || d.value < -1000
                        ? `${(d.value / 1000).toFixed(1)}k`
                        : String(Math.round(d.value))
                    : ''}
                </Text>
                <View
                  style={{
                    height: `${barHeight}%`,
                    backgroundColor: isZero ? '#e5e7eb' : isNegative ? '#dc2626' : color,
                    width: '100%',
                    maxWidth: 28,
                    borderWidth: isZero ? 1 : 0,
                    borderColor: '#e5e7eb',
                    opacity: isZero ? 1 : 1,
                  }}
                  className='rounded-full'
                />
              </View>
              <Text
                className={`text-xs font-bold ${isZero ? 'text-gray-400' : 'text-gray-600'}`}
                numberOfLines={1}
              >
                {d.label}
              </Text>
              {isZero ? (
                <View className='w-1 h-1 rounded-full bg-gray-300 -mt-0.5' />
              ) : null}
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ---------- Line Chart with switchable metric ----------
export function LineChart({
  data,
  color = '#111827',
  height = 160,
  width, // optional fixed width; if omitted, uses screen width
}: {
  data: Array<{ label: string; value: number }>
  color?: string
  height?: number
  width?: number
}) {
  const { width: screenW } = useWindowDimensions()
  const w = width ?? Math.min(screenW - 32, 360)
  const padding = 16
  const yLabelW = 36
  const chartW = w - padding * 2 - yLabelW
  const chartH = height - 38 // extra for x labels + value bubbles
  const max = Math.max(...data.map((d) => d.value), 1)
  const min = Math.min(...data.map((d) => d.value), 0)
  // add headroom so top dot not clipped by value label
  const paddedMax = max === 0 ? 1 : max * 1.18
  const paddedMin = min < 0 ? min * 1.18 : 0
  const range = paddedMax - paddedMin || 1

  // build path
  const points = data.map((d, i) => {
    const x = padding + yLabelW + (i / Math.max(data.length - 1, 1)) * chartW
    const y = padding + 10 + chartH - ((d.value - paddedMin) / range) * chartH
    return { x, y, label: d.label, value: d.value }
  })

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')
  const areaD = `${pathD} L ${points[points.length - 1]?.x ?? 0} ${padding + 10 + chartH} L ${points[0]?.x ?? 0} ${padding + 10 + chartH} Z`

  const formatVal = (v: number) => (v === 0 ? '0' : v > 1000 || v < -1000 ? `${(v/1000).toFixed(1)}k` : String(Math.round(v)))

  return (
    <View className='bg-white rounded-2xl overflow-hidden'>
      <Svg width={w} height={height} className='bg-white'>
        {/* y-axis labels */}
        {[0, 0.5, 1].map((t) => {
          const v = paddedMax - t * range
          const y = padding + 10 + chartH * t
          return (
            <G key={t}>
              <Line x1={padding + yLabelW} y1={y} x2={padding + yLabelW + chartW} y2={y} stroke='#f3f4f6' strokeWidth={1} />
              <SvgText x={padding + yLabelW - 4} y={y + 3} textAnchor='end' fontSize={8} fontWeight='600' fill='#9ca3af'>
                {Math.round(v).toLocaleString('en-KE')}
              </SvgText>
            </G>
          )
        })}
        {/* zero baseline if negative values present */}
        {paddedMin < 0 ? (
          <Line
            x1={padding + yLabelW}
            y1={padding + 10 + chartH - ((0 - paddedMin) / range) * chartH}
            x2={padding + yLabelW + chartW}
            y2={padding + 10 + chartH - ((0 - paddedMin) / range) * chartH}
            stroke='#e5e7eb'
            strokeWidth={1}
            strokeDasharray='3 3'
          />
        ) : null}
        {/* area fill */}
        <Path d={areaD} fill={color} fillOpacity={0.08} />
        {/* line */}
        <Path
          d={pathD}
          stroke={color}
          strokeWidth={2.5}
          fill='none'
          strokeLinejoin='round'
          strokeLinecap='round'
        />
        {/* dots + value bubbles */}
        {points.map((p, i) => {
          const isZero = p.value === 0
          return (
            <G key={i}>
              {/* halo */}
              <Circle cx={p.x} cy={p.y} r={10} fill={color} opacity={isZero ? 0.04 : 0.08} />
              {/* value bubble above dot */}
              <G>
                <SvgText
                  x={p.x}
                  y={p.y - 10}
                  textAnchor='middle'
                  fontSize={8}
                  fontWeight='700'
                  fill={isZero ? '#9ca3af' : '#374151'}
                >
                  {formatVal(p.value)}
                </SvgText>
              </G>
              <Circle
                cx={p.x}
                cy={p.y}
                r={isZero ? 4 : 3.5}
                fill={isZero ? 'white' : color}
                stroke={color}
                strokeWidth={isZero ? 1.5 : 2}
              />
              {isZero ? <Circle cx={p.x} cy={p.y} r={1.2} fill={color} /> : null}
            </G>
          )
        })}
      </Svg>
      <View className='flex-row justify-between' style={{ paddingLeft: padding + yLabelW, paddingRight: padding, marginTop: 2 }}>
        {points.map((p, i) => (
          <Text
            key={i}
            className={`text-xs font-bold ${p.value === 0 ? 'text-gray-400' : 'text-gray-500'}`}
            style={{ width: chartW / points.length, textAlign: 'center' }}
            numberOfLines={1}
          >
            {p.label}
          </Text>
        ))}
      </View>
    </View>
  )
}

export function SwitchableLineCard({
  sales,
  revenue,
  profit,
}: {
  sales: Array<{ label: string; value: number }>
  revenue: Array<{ label: string; value: number }>
  profit: Array<{ label: string; value: number }>
}) {
  const [metric, setMetric] = React.useState<'sales' | 'revenue' | 'profit'>(
    'revenue',
  )
  const data =
    metric === 'sales' ? sales : metric === 'revenue' ? revenue : profit
  const color =
    metric === 'sales'
      ? '#111827'
      : metric === 'revenue'
        ? '#0f766e'
        : '#1d4ed8'
  const label =
    metric === 'sales' ? 'Sales' : metric === 'revenue' ? 'Revenue' : 'Profit'

  return (
    <View className='gap-3'>
      <Tabs
        value={metric}
        onValueChange={(v) => setMetric(v as any)}
        orientation='horizontal'
        defaultValue='revenue'
        activationMode='manual'
        style={{ width: '100%' }}
      >
        <Tabs.List
          style={{
            backgroundColor: '#f3f4f6',
            borderRadius: 999,
            padding: 4,
            gap: 4,
            width: '100%',
            flexDirection: 'row',
          }}
        >
          {(['sales', 'revenue', 'profit'] as const).map((m) => (
            <Tabs.Tab
              key={m}
              value={m}
              flex={1}
              justifyContent='center'
              alignItems='center'
              paddingHorizontal={10}
              paddingVertical={7}
              borderRadius={999}
              backgroundColor={metric === m ? 'white' : 'transparent'}
              borderWidth={metric === m ? 1 : 0}
              borderColor={metric === m ? '#e5e7eb' : 'transparent'}
              style={{
                flex: 1,
                backgroundColor: metric === m ? 'white' : 'transparent',
                borderRadius: 999,
                borderWidth: metric === m ? 1 : 0,
                borderColor: metric === m ? '#e5e7eb' : 'transparent',
                minWidth: 0,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  textTransform: 'capitalize',
                  color: metric === m ? '#111827' : '#6b7280',
                  textAlign: 'center',
                }}
              >
                {m}
              </Text>
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <View className='bg-white rounded-2xl border border-gray-200 p-2'>
        <View className='flex-row justify-between items-center px-2 py-1'>
          <Text className='text-xs font-bold tracking-widest text-gray-400 uppercase'>
            {label} • 7 days • 0 = no sales
          </Text>
          <Text className='text-xs font-bold text-gray-900'>
            KES{' '}
            {Math.max(...data.map((d) => d.value), 0).toLocaleString('en-KE')}
          </Text>
        </View>
        <LineChart
          data={data.length ? data : [{ label: '—', value: 0 }]}
          color={color}
        />
        <Text className='text-xs text-gray-400 text-center mt-1'>Dots on baseline = 0 • value above each point</Text>
      </View>
    </View>
  )
}

// ---------- Pie Chart for categorical sales ----------
export function PieChart({
  data,
  size = 160,
}: {
  data: Array<{ name: string; value: number; color?: string }>
  size?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 0
  // Don't render a fake pie when total is 0 — caller shows "No category data"
  if (total === 0) {
    return (
      <View className='items-center justify-center' style={{ width: size, height: size }}>
        <View className='w-20 h-20 rounded-full bg-gray-100 border border-gray-200 items-center justify-center'>
          <Text className='text-xs font-bold text-gray-400'>No data</Text>
        </View>
      </View>
    )
  }
  // Vibrant, high-contrast palette — sky/emerald/amber/rose/violet/pink/cyan + slate — distinct on white
  const palette = [
    '#0ea5e9', // sky-500
    '#10b981', // emerald-500
    '#f59e0b', // amber-500
    '#ef4444', // red-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
    '#06b6d4', // cyan-500
    '#6366f1', // indigo-500
    '#84cc16', // lime-500
    '#f97316', // orange-500
  ]
  let acc = 0
  const segments = data.map((d, i) => {
    const start = (acc / total) * 2 * Math.PI
    acc += d.value
    const end = (acc / total) * 2 * Math.PI
    const largeArc = end - start > Math.PI ? 1 : 0
    const r = size / 2 - 8
    const cx = size / 2
    const cy = size / 2
    const x1 = cx + r * Math.cos(start - Math.PI / 2)
    const y1 = cy + r * Math.sin(start - Math.PI / 2)
    const x2 = cx + r * Math.cos(end - Math.PI / 2)
    const y2 = cy + r * Math.sin(end - Math.PI / 2)
    const color = d.color || palette[i % palette.length]
    const pct = (d.value / total) * 100
    return { ...d, color, start, end, largeArc, x1, y1, x2, y2, pct, cx, cy, r }
  })

  return (
    <View className='flex-row items-center gap-4'>
      <Svg width={size} height={size}>
        {segments.map((s, i) => {
          if (s.pct < 0.5) return null
          const d = `M ${s.cx} ${s.cy} L ${s.x1} ${s.y1} A ${s.r} ${s.r} 0 ${s.largeArc} 1 ${s.x2} ${s.y2} Z`
          return (
            <Path key={i} d={d} fill={s.color} stroke='white' strokeWidth={2.5} />
          )
        })}
        <Circle cx={size / 2} cy={size / 2} r={size * 0.24} fill='white' stroke='#f3f4f6' strokeWidth={1} />
        <G>
          <SvgText
            x={size / 2}
            y={size / 2 - 5}
            textAnchor='middle'
            fontSize={9}
            fontWeight='700'
            fill='#9ca3af'
          >
            TOTAL
          </SvgText>
          <SvgText
            x={size / 2}
            y={size / 2 + 10}
            textAnchor='middle'
            fontSize={12}
            fontWeight='800'
            fill='#111827'
          >
            {total > 1000
              ? `${(total / 1000).toFixed(1)}k`
              : String(Math.round(total))}
          </SvgText>
        </G>
      </Svg>
      <View className='flex-1 gap-2.5'>
        {segments.slice(0, 6).map((s, i) => (
          <View key={i} className='flex-row items-center gap-2.5'>
            <View
              style={{
                backgroundColor: s.color,
                width: 12,
                height: 12,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: 'white',
                shadowColor: s.color,
                shadowOpacity: 0.25,
                shadowRadius: 2,
              }}
            />
            <Text
              className='text-xs font-semibold text-gray-900 flex-1'
              numberOfLines={1}
            >
              {s.name}
            </Text>
            <Text className='text-xs font-bold text-gray-700'>
              {s.pct.toFixed(1)}%
            </Text>
          </View>
        ))}
        {segments.length > 6 && (
          <Text className='text-xs text-gray-400'>
            +{segments.length - 6} more • {segments.slice(6).reduce((acc, cur) => acc + cur.pct, 0).toFixed(1)}%
          </Text>
        )}
      </View>
    </View>
  )
}
