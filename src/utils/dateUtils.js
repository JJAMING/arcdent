export const getCurrentYearString = () => String(new Date().getFullYear());

export const getDefaultYearOptions = (years = []) => {
    const currentYear = getCurrentYearString();
    return Array.from(new Set([currentYear, ...years.map(year => String(year)).filter(Boolean)]))
        .sort((a, b) => Number(b) - Number(a));
};

export const getRollingYearOptions = ({ past = 3, future = 1 } = {}) => {
    const currentYear = Number(getCurrentYearString());
    const years = [];
    for (let year = currentYear + future; year >= currentYear - past; year -= 1) {
        years.push(String(year));
    }
    return years;
};
