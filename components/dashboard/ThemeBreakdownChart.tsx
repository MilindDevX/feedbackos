'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatTheme, THEME_COLORS } from '@/lib/utils'

interface ThemeBreakdownChartProps {
  data: Record<string, number>
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-card px-3 py-2 text-xs">
      <p className="text-gray-300 font-medium">{formatTheme(label)}</p>
      <p className="text-white font-bold">{payload[0].value} items</p>
    </div>
  )
}

export default function ThemeBreakdownChart({ data }: ThemeBreakdownChartProps) {
  const chartData = Object.entries(data)
    .map(([theme, count]) => ({ theme, count, label: formatTheme(theme) }))
    .sort((a, b) => b.count - a.count)

  const hasData = chartData.length > 0

  return (
    <div className="glass-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">Feedback by Theme</h3>
        <p className="text-xs text-gray-500 mt-0.5">Volume breakdown by category</p>
      </div>

      {!hasData ? (
        <div className="h-64 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-500 text-sm">No classified feedback yet</p>
            <a href="/ingest" className="text-brand-400 text-xs hover:text-brand-300 mt-1 block">
              Add your first feedback →
            </a>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(25% 0 0)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              angle={-20}
              textAnchor="end"
              height={40}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'oklch(25% 0 0 / 0.5)' }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.theme}
                  fill={THEME_COLORS[entry.theme] || '#6b7280'}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
