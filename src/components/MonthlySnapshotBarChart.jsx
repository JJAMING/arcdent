import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const defaultFormatValue = (value) => Number(value || 0).toLocaleString();

const SnapshotTooltip = ({ active, payload, valueLabel, formatValue }) => {
  if (!active || !payload?.length) return null;

  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: 10,
        boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12)',
        minWidth: 168,
        padding: '0.7rem 0.8rem',
      }}
    >
      <div style={{ color: 'var(--text-primary)', fontSize: '0.86rem', fontWeight: 800, marginBottom: 4 }}>
        {item.name}
      </div>
      <div style={{ color: item.color || '#3b82f6', fontSize: '0.82rem', fontWeight: 700 }}>
        {valueLabel}: {formatValue(item.value)}
      </div>
      {item.detail && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', lineHeight: 1.5, marginTop: 4 }}>
          {item.detail}
        </div>
      )}
    </div>
  );
};

const MonthlySnapshotBarChart = ({
  data = [],
  valueLabel = '값',
  formatValue = defaultFormatValue,
  height,
  emptyMessage = '해당 월에 표시할 데이터가 없습니다.',
}) => {
  const chartData = (Array.isArray(data) ? data : [])
    .map((item) => ({ ...item, value: Number(item?.value || 0) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  if (chartData.length === 0) {
    return (
      <div
        className="empty-state"
        style={{ minHeight: height || 240, display: 'grid', placeItems: 'center' }}
      >
        {emptyMessage}
      </div>
    );
  }

  const resolvedHeight = height || Math.max(240, Math.min(560, chartData.length * 46 + 54));

  return (
    <ResponsiveContainer width="100%" height={resolvedHeight}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 8, right: 132, bottom: 8, left: 12 }}
        barCategoryGap="28%"
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
          tickFormatter={formatValue}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={146}
          tick={{ fontSize: 12, fill: 'var(--text-primary)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<SnapshotTooltip valueLabel={valueLabel} formatValue={formatValue} />} cursor={{ fill: 'rgba(59, 130, 246, 0.06)' }} />
        <Bar dataKey="value" radius={[0, 5, 5, 0]} maxBarSize={30} isAnimationActive={false}>
          {chartData.map((entry, index) => (
            <Cell key={`${entry.name}-${index}`} fill={entry.color || '#3b82f6'} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={formatValue}
            style={{ fill: 'var(--text-primary)', fontSize: 11, fontWeight: 700 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export default MonthlySnapshotBarChart;
