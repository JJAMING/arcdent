import { Calendar, ChevronDown } from 'lucide-react';
import { useState } from 'react';

const MONTHS = Array.from({ length: 12 }, (_, index) => `${index + 1}월`);

export default function AnalysisPeriodControls({
    selectedYear,
    availableYears,
    onYearChange,
    half,
    onHalfChange,
    monthFilter,
    onMonthFilterChange,
}) {
    const [isYearOpen, setIsYearOpen] = useState(false);
    const [isMonthOpen, setIsMonthOpen] = useState(false);

    const selectPeriod = (nextHalf) => {
        onHalfChange(nextHalf);
        onMonthFilterChange('all');
    };

    return (
        <div className="analysis-period-controls">
            <div className="year-selector-container">
                <button type="button" className="year-select-btn" onClick={() => setIsYearOpen(open => !open)}>
                    <Calendar size={16} />
                    {selectedYear}년
                    <ChevronDown size={14} style={{ transform: isYearOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {isYearOpen && (
                    <div className="year-dropdown">
                        {availableYears.map(year => (
                            <button
                                type="button"
                                key={year}
                                className={`year-item ${selectedYear === year ? 'active' : ''}`}
                                onClick={() => {
                                    onYearChange(year);
                                    onMonthFilterChange('all');
                                    setIsYearOpen(false);
                                }}
                            >
                                {year}년
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="period-tabs">
                <button type="button" className={half === 'all' && monthFilter === 'all' ? 'active' : ''} onClick={() => selectPeriod('all')}>전체보기</button>
                <button type="button" className={half === 'first' && monthFilter === 'all' ? 'active' : ''} onClick={() => selectPeriod('first')}>상반기</button>
                <button type="button" className={half === 'second' && monthFilter === 'all' ? 'active' : ''} onClick={() => selectPeriod('second')}>하반기</button>
            </div>

            <div className="year-selector-container">
                <button type="button" className="year-select-btn" onClick={() => setIsMonthOpen(open => !open)}>
                    {monthFilter === 'all' ? '월별보기' : monthFilter}
                    <ChevronDown size={14} style={{ transform: isMonthOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {isMonthOpen && (
                    <div className="year-dropdown period-month-dropdown">
                        <button
                            type="button"
                            className={`year-item ${monthFilter === 'all' ? 'active' : ''}`}
                            onClick={() => {
                                onMonthFilterChange('all');
                                setIsMonthOpen(false);
                            }}
                        >
                            기간 기준
                        </button>
                        {MONTHS.map(month => (
                            <button
                                type="button"
                                key={month}
                                className={`year-item ${monthFilter === month ? 'active' : ''}`}
                                onClick={() => {
                                    onMonthFilterChange(month);
                                    setIsMonthOpen(false);
                                }}
                            >
                                {month}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
