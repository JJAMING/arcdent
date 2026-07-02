export const DEFAULT_IMPLANT_TYPES = [
    { name: '오스템', color: '#4472c4', aliases: ['osstem', '오스템'] },
    { name: '덴티움', color: '#ed7d31', aliases: ['dentium', '덴티움'] },
    { name: '디오', color: '#a9d18e', aliases: ['dio', '디오'] },
    { name: '스트라우만', color: '#9dc3e6', aliases: ['straumann', '스트라우만'] },
];

export const IMPLANT_TYPE_COLORS = [
    '#4472c4',
    '#ed7d31',
    '#a9d18e',
    '#9dc3e6',
    '#70ad47',
    '#7030a0',
    '#17becf',
    '#ec4899',
    '#f59e0b',
    '#10b981',
];

export const normalizeImplantText = (value = '') => String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()[\]{}_\-./\\]/g, '')
    .trim();

export const normalizeImplantTypes = (types = []) => {
    const source = Array.isArray(types) && types.length > 0 ? types : DEFAULT_IMPLANT_TYPES;
    const seen = new Set();

    return source
        .map((type, index) => {
            const name = String(type?.name || '').trim();
            if (!name) return null;
            const key = normalizeImplantText(name);
            if (!key || seen.has(key)) return null;
            seen.add(key);
            return {
                id: type?.id || key,
                name,
                color: type?.color || IMPLANT_TYPE_COLORS[index % IMPLANT_TYPE_COLORS.length],
                sort_order: Number.isFinite(Number(type?.sort_order)) ? Number(type.sort_order) : index + 1,
                is_active: type?.is_active !== false,
                aliases: Array.isArray(type?.aliases) ? type.aliases : [],
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.sort_order - b.sort_order);
};

export const getImplantTypeAliases = (type) => {
    const builtin = DEFAULT_IMPLANT_TYPES.find(item => normalizeImplantText(item.name) === normalizeImplantText(type?.name));
    return [
        type?.name,
        ...(type?.aliases || []),
        ...(builtin?.aliases || []),
    ]
        .map(normalizeImplantText)
        .filter(Boolean);
};

export const getLegacyImplantTypeValue = (payload = {}, typeName = '') => {
    const key = normalizeImplantText(typeName);
    const legacyMap = {
        [normalizeImplantText('오스템')]: 'osstem',
        [normalizeImplantText('덴티움')]: 'dentium',
        [normalizeImplantText('디오')]: 'dio',
        [normalizeImplantText('스트라우만')]: 'straumann',
    };
    const legacyKey = legacyMap[key];
    return legacyKey ? Number(payload?.[legacyKey] || 0) : 0;
};

export const getImplantTypeCounts = (payload = {}, implantTypes = []) => {
    const configuredTypes = normalizeImplantTypes(implantTypes);
    const savedCounts = payload?.implantTypes && typeof payload.implantTypes === 'object'
        ? payload.implantTypes
        : {};

    return configuredTypes.reduce((acc, type) => {
        acc[type.name] = Number(savedCounts[type.name] ?? getLegacyImplantTypeValue(payload, type.name) ?? 0);
        return acc;
    }, {});
};

export const getImplantTypeStorageKey = (index) => `implantType_${index}`;
