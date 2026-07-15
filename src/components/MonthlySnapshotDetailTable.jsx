import React from 'react';
import './MonthlySnapshotDetailTable.css';

const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const defaultFormatValue = (value, unit) => `${asNumber(value).toLocaleString()}${unit || ''}`;

const MonthlySnapshotDetailTable = ({
  rows = [],
  monthLabels = [],
  selectedMonth,
  selectedIndex = 0,
  emptyMessage = '표시할 데이터가 없습니다.',
}) => {
  const safeIndex = Math.max(0, selectedIndex);

  if (!rows.length) {
    return <div className="monthly-detail-snapshot__empty">{emptyMessage}</div>;
  }

  return (
    <div className="monthly-detail-snapshot">
      <table className="monthly-detail-snapshot__table">
        <thead>
          <tr>
            <th>구분</th>
            <th>{selectedMonth || `${safeIndex + 1}월`}</th>
            <th>전월 대비</th>
            <th>연간 누적</th>
            <th>월별 추이</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const values = Array.isArray(row.values) ? row.values.map(asNumber) : [];
            const currentValue = asNumber(values[safeIndex]);
            const hasPrevious = safeIndex > 0;
            const previousValue = hasPrevious ? asNumber(values[safeIndex - 1]) : 0;
            const changeValue = currentValue - previousValue;
            const changeRate = previousValue !== 0 ? (changeValue / Math.abs(previousValue)) * 100 : null;
            const cumulativeValue = values.slice(0, safeIndex + 1).reduce((sum, value) => sum + value, 0);
            const maxValue = Math.max(...values.map(Math.abs), 1);
            const formatValue = row.formatValue || ((value) => defaultFormatValue(value, row.unit));
            const formatChange = row.formatChange || ((value) => {
              const sign = value > 0 ? '+' : '';
              return `${sign}${formatValue(value)}`;
            });

            return (
              <tr key={row.key || row.label}>
                <th scope="row">
                  <span
                    className="monthly-detail-snapshot__marker"
                    style={{ backgroundColor: row.color || '#3b82f6' }}
                  />
                  {row.label}
                </th>
                <td className="monthly-detail-snapshot__value">{formatValue(currentValue)}</td>
                <td>
                  {hasPrevious ? (
                    <div className={`monthly-detail-snapshot__change ${changeValue > 0 ? 'is-up' : changeValue < 0 ? 'is-down' : 'is-flat'}`}>
                      <strong>{formatChange(changeValue)}</strong>
                      {row.showRate !== false && (
                        <small>{changeRate === null ? '전월 0' : `${changeRate > 0 ? '+' : ''}${changeRate.toFixed(1)}%`}</small>
                      )}
                    </div>
                  ) : (
                    <span className="monthly-detail-snapshot__muted">비교 데이터 없음</span>
                  )}
                </td>
                <td className="monthly-detail-snapshot__value">{formatValue(cumulativeValue)}</td>
                <td>
                  <div className="monthly-detail-snapshot__trend" aria-label={`${row.label} 월별 추이`}>
                    {values.map((value, index) => (
                      <span
                        key={`${row.key || row.label}-${index}`}
                        title={`${monthLabels[index] || `${index + 1}월`}: ${formatValue(value)}`}
                        className={index === safeIndex ? 'is-selected' : ''}
                        style={{
                          height: `${Math.max(5, (Math.abs(value) / maxValue) * 100)}%`,
                          backgroundColor: row.color || '#3b82f6',
                        }}
                      />
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default MonthlySnapshotDetailTable;
