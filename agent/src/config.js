import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 설정 파일 2개
//   defaults.json : 모든 치과 공통 (Supabase 주소/키) — agent 폴더를 다른 치과에 복사할 때 같이 가져갑니다.
//   config.json   : 이 치과 전용 (중계 계정, 덴트웹 아이디/비밀번호) — 절대 다른 곳에 복사하지 않습니다.
// 덴트웹 서버 주소/포트는 관리자모드(EMR 연동)에서 받아오며, config.json 의 값은 예비용입니다.

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_FILE = path.join(ROOT, 'config.json');
export const DEFAULTS_FILE = path.join(ROOT, 'defaults.json');

const readJson = (file) => {
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    } catch (error) {
        throw new Error(`${path.basename(file)} 형식이 올바르지 않습니다. setup.bat 을 다시 실행해 주세요. (${error.message})`);
    }
};

const isPlaceholder = (value) => !value || /프로젝트ID|Supabase_anon|치과코드|덴트웹에서_|중계계정_/.test(String(value));

export const loadDefaults = () => {
    const defaults = readJson(DEFAULTS_FILE) || {};
    return {
        supabaseUrl: isPlaceholder(defaults.supabaseUrl) ? '' : defaults.supabaseUrl,
        supabaseAnonKey: isPlaceholder(defaults.supabaseAnonKey) ? '' : defaults.supabaseAnonKey,
    };
};

export const saveDefaults = ({ supabaseUrl, supabaseAnonKey }) => {
    fs.writeFileSync(DEFAULTS_FILE, JSON.stringify({ supabaseUrl, supabaseAnonKey }, null, 2), 'utf8');
};

export const readRawConfig = () => readJson(CONFIG_FILE);

export const saveConfig = (config) => {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
};

/**
 * 프로그램 전체에서 쓰는 설정 형태로 합칩니다.
 * 예전 config.json(supabase.url/anonKey 포함)도 그대로 읽고, defaults.json 이 없으면 만들어 둡니다.
 */
export const loadConfig = () => {
    const raw = readRawConfig();
    if (!raw) throw new Error('config.json 이 없습니다. setup.bat 을 실행해서 설정해 주세요.');

    const defaults = loadDefaults();
    const legacyUrl = isPlaceholder(raw.supabase?.url) ? '' : raw.supabase?.url;
    const legacyKey = isPlaceholder(raw.supabase?.anonKey) ? '' : raw.supabase?.anonKey;
    if ((!defaults.supabaseUrl || !defaults.supabaseAnonKey) && legacyUrl && legacyKey) {
        // 예전 방식 config.json 에서 공통값을 분리해 defaults.json 으로 저장 (다른 치과 설치용)
        saveDefaults({ supabaseUrl: legacyUrl, supabaseAnonKey: legacyKey });
        defaults.supabaseUrl = legacyUrl;
        defaults.supabaseAnonKey = legacyKey;
    }

    const config = {
        supabase: {
            url: defaults.supabaseUrl || legacyUrl,
            anonKey: defaults.supabaseAnonKey || legacyKey,
            agentEmail: raw.supabase?.agentEmail || '',
            agentPassword: raw.supabase?.agentPassword || '',
        },
        dentweb: {
            server: raw.dentweb?.server || '',
            instance: raw.dentweb?.instance || 'DENTWEB',
            port: Number(raw.dentweb?.port) || 0,
            database: raw.dentweb?.database || 'DentWeb',
            user: raw.dentweb?.user || '',
            password: raw.dentweb?.password || '',
        },
        intervalSeconds: Number(raw.intervalSeconds) || 180,
    };

    if (isPlaceholder(config.supabase.agentEmail) || !config.supabase.agentPassword) {
        throw new Error('중계 계정 이메일/비밀번호가 없습니다. setup.bat 을 실행해 주세요.');
    }
    if (isPlaceholder(config.dentweb.user) || !config.dentweb.password) {
        throw new Error('덴트웹 아이디/비밀번호가 없습니다. setup.bat 을 실행해 주세요.');
    }
    return config;
};

/**
 * 실제로 접속할 덴트웹 설정 = 관리자모드 설정(서버/포트/인스턴스/DB) + config.json(아이디/비밀번호)
 * 관리자모드에 서버 주소가 없으면 config.json 의 서버 정보를 씁니다.
 */
export const resolveDentwebConfig = (local, remote) => {
    const useRemote = Boolean(remote && String(remote.server || '').trim());
    const merged = useRemote
        ? {
            server: String(remote.server).trim(),
            port: Number(remote.port) || 0,
            instance: remote.instance || 'DENTWEB',
            database: remote.database_name || 'DentWeb',
            user: local.user,
            password: local.password,
        }
        : { ...local };
    if (!merged.server) {
        throw new Error('덴트웹 서버 주소가 없습니다. 관리자모드 → EMR 연동에서 서버 IP를 입력해 주세요.');
    }
    return { ...merged, source: useRemote ? '관리자모드' : 'config.json' };
};
