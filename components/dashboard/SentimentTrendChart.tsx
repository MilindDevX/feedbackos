'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { formatTheme, THEME_COLORS } from '@/lib/utils'

interface TrendData {
  weeks: string[]
  topThemes: string[]
  chartData: Array<Record<string, number | string>>
  themeTotals: Record<string, number>
}

interface SentimentTrendChartProps {
  trends: TrendData | null
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-card px-3 py-2 text-xs space-y-1">
      <p className="text-gray-400 font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-gray-300">{formatTheme(p.dataKey)}:</span>
          <span className="text-white font-bold">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function SentimentTrendChart({ trends }: SentimentTrendChartProps) {
  const hasData = trends && trends.chartData.length > 0 && trends.topThemes.length > 0

  return (
    <div className="glass-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">Weekly Trend — Top Themes</h3>
        <p className="text-xs text-gray-500 mt-0.5">Last 12 weeks, top 3 themes</p>
      </div>

      {!hasData ? (
        <div className="h-64 flex items-center justify-center">
          <p className="text-gray-500 text-sm">No trend data available yet</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <LineChart data={trends.chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(25% 0 0)" vertical={false} />
            <XAxis
              dataKey="week"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={1}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => (
                <span style={{ color: '#9ca3af', fontSize: '11px' }}>{formatTheme(value)}</span>
              )}
            />
            {trends.topThemes.map((theme) => (
              <Line
                key={theme}
                type="monotone"
                dataKey={theme}
                stroke={THEME_COLORS[theme] || '#6b7280'}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
