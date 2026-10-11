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

interface TooltipEntry { dataKey: string; color: string; value: number }

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-line bg-surface shadow-raised px-3 py-2 text-xs space-y-1">
      <p className="text-ink-3 font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-ink-2">{formatTheme(p.dataKey)}:</span>
          <span className="text-ink font-semibold tabular">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function SentimentTrendChart({ trends }: SentimentTrendChartProps) {
  const hasData = trends && trends.chartData.length > 0 && trends.topThemes.length > 0

  if (!hasData) {
    return <div className="h-60 flex items-center justify-center text-sm text-ink-2">Trends appear after a few weeks of feedback.</div>
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={trends.chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid stroke="#8a8a9a" strokeOpacity={0.18} vertical={false} />
        <XAxis dataKey="week" tick={{ fill: '#8a8a9a', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tick={{ fill: '#8a8a9a', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#8a8a9a', strokeOpacity: 0.3 }} />
        <Legend iconType="circle" iconSize={7} formatter={(value) => <span style={{ color: '#8a8a9a', fontSize: 12 }}>{formatTheme(value)}</span>} />
        {trends.topThemes.map((theme) => (
          <Line key={theme} type="monotone" dataKey={theme} stroke={THEME_COLORS[theme] || '#8a8a9a'} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
