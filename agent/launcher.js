// 아크덴트 EMR 중계 프로그램 — 런처 (자동 업데이트 + 재시작 관리)
//
// Windows 작업 스케줄러는 이 파일 하나만 실행합니다. 런처가 하는 일:
//   1) 실제 중계 프로그램(src/index.js run)을 자식 프로세스로 실행하고, 꺼지면 30초 뒤 다시 켬
//   2) 30분마다 https://arcdent.vercel.app/agent/manifest.json 에서 새 버전 확인
//   3) 새 버전이 있으면 파일을 내려받아 지문(sha256)을 검증 → 교체 → 재시작
//   4) 새 버전이 계속 바로 꺼지면 이전 버전으로 자동 복구
//
// 이 파일은 되도록 바꾸지 않습니다. (바뀌면 다음 PC 재시작 때 적용)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(ROOT, 'logs');
const BACKUP_DIR = path.join(ROOT, '.backup');
const STAGING_DIR = path.join(ROOT, '.update');
const SKIP_FILE = path.join(ROOT, '.skip-version'); // 복구된(문제 있는) 버전은 다시 받지 않음
const DEFAULT_UPDATE_URL = 'https://arcdent.vercel.app/agent';
const UPDATE_CHECK_MS = 30 * 60 * 1000;
const RESTART_DELAY_MS = 30 * 1000;
const CRASH_WINDOW_MS = 2 * 60 * 1000; // 시작 후 2분 안에 꺼지면 '바로 꺼짐'으로 봄
const ROLLBACK_AFTER_CRASHES = 3;
// 업데이트로 바꿀 수 있는 파일만 허용 (config.json, defaults.json 등은 절대 건드리지 않음)
const ALLOWED_PATH = /^(src\/[A-Za-z0-9_-]+\.js|package\.json|package-lock\.json|launcher\.js|README\.md|[A-Za-z0-9_-]+\.(bat|ps1))$/;

const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const log = (level, message) => {
    const now = new Date();
    const line = `[${now.toLocaleString('ko-KR')}] ${level} [런처] ${message}`;
    console.log(line);
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFileSync(path.join(LOG_DIR, `agent-${ymd(now)}.log`), `${line}\n`, 'utf8');
    } catch { /* 무시 */ }
};

const readJson = (file, fallback = null) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return fallback; }
};
const localVersion = () => readJson(path.join(ROOT, 'package.json'), {})?.version || '0.0.0';
const updateBaseUrl = () => String(readJson(path.join(ROOT, 'defaults.json'), {})?.updateUrl || DEFAULT_UPDATE_URL).replace(/\/+$/, '');
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const compareVersions = (a, b) => {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i += 1) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
    }
    return 0;
};

const nodeExe = process.execPath;
const npmCmd = (() => {
    const candidate = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'npm.cmd' : 'npm');
    return fs.existsSync(candidate) ? candidate : 'npm';
})();

// ---------------------------------------------------------------------------
// 자식 프로세스(실제 중계 프로그램) 관리
// ---------------------------------------------------------------------------
let child = null;
let childStartedAt = 0;
let quickCrashes = 0;
let stopping = false;
let restartTimer = null;

const startChild = () => {
    if (child || stopping) return;
    childStartedAt = Date.now();
    child = spawn(nodeExe, ['src/index.js', 'run'], {
        cwd: ROOT,
        stdio: 'inherit',
        windowsHide: true,
        env: { ...process.env, ARCDENT_LAUNCHER_PID: String(process.pid) },
    });
    log('INFO', `중계 프로그램 시작 (v${localVersion()})`);
    child.on('exit', (code) => {
        child = null;
        if (stopping) return;
        const lived = Date.now() - childStartedAt;
        quickCrashes = lived < CRASH_WINDOW_MS ? quickCrashes + 1 : 0;
        log('WARN', `중계 프로그램 종료 (코드 ${code}) — ${RESTART_DELAY_MS / 1000}초 뒤 다시 시작`);
        if (quickCrashes >= ROLLBACK_AFTER_CRASHES && fs.existsSync(BACKUP_DIR)) {
            rollback();
            quickCrashes = 0;
        }
        restartTimer = setTimeout(startChild, RESTART_DELAY_MS);
    });
};

const stopChild = () => new Promise(resolve => {
    clearTimeout(restartTimer);
    if (!child) return resolve();
    const current = child;
    current.once('exit', () => resolve());
    current.kill();
    setTimeout(() => { try { current.kill('SIGKILL'); } catch { /* 이미 종료 */ } resolve(); }, 10000);
});

// ---------------------------------------------------------------------------
// 업데이트
// ---------------------------------------------------------------------------
const copyFileSafe = (from, to) => {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
};

const rollback = () => {
    try {
        const files = readJson(path.join(BACKUP_DIR, 'files.json'), []);
        const badVersion = localVersion();
        files.forEach(rel => copyFileSafe(path.join(BACKUP_DIR, rel), path.join(ROOT, rel)));
        fs.writeFileSync(SKIP_FILE, badVersion);
        log('WARN', `새 버전이 계속 실패해서 이전 버전(v${localVersion()})으로 복구했습니다.`);
        fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
    } catch (error) {
        log('ERROR', `이전 버전 복구 실패: ${error.message}`);
    }
};

const checkForUpdate = async () => {
    const base = updateBaseUrl();
    let manifest;
    try {
        const response = await fetch(`${base}/manifest.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        manifest = await response.json();
    } catch (error) {
        log('WARN', `업데이트 확인 실패: ${error.message}`);
        return;
    }
    const current = localVersion();
    if (!manifest?.version || compareVersions(manifest.version, current) <= 0) return;
    const skipped = fs.existsSync(SKIP_FILE) ? fs.readFileSync(SKIP_FILE, 'utf8').trim() : '';
    if (skipped && skipped === manifest.version) return;
    if (!Array.isArray(manifest.files) || manifest.files.some(file => !ALLOWED_PATH.test(String(file.path || '')))) {
        log('ERROR', '업데이트 목록에 허용되지 않은 파일이 있어 업데이트를 건너뜁니다.');
        return;
    }

    log('INFO', `새 버전 발견: v${current} → v${manifest.version} — 내려받는 중`);
    try {
        // 1) 전부 내려받고 지문 검증 (하나라도 틀리면 아무것도 바꾸지 않음)
        fs.rmSync(STAGING_DIR, { recursive: true, force: true });
        for (const file of manifest.files) {
            const response = await fetch(`${base}/files/${file.path}?v=${manifest.version}`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`${file.path} 내려받기 실패 (HTTP ${response.status})`);
            const buffer = Buffer.from(await response.arrayBuffer());
            if (sha256(buffer) !== file.sha256) throw new Error(`${file.path} 파일 검증 실패`);
            fs.mkdirSync(path.dirname(path.join(STAGING_DIR, file.path)), { recursive: true });
            fs.writeFileSync(path.join(STAGING_DIR, file.path), buffer);
        }

        const oldPackage = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
        const newPackage = fs.readFileSync(path.join(STAGING_DIR, 'package.json'), 'utf8');
        const dependenciesChanged = JSON.stringify(JSON.parse(oldPackage).dependencies || {}) !== JSON.stringify(JSON.parse(newPackage).dependencies || {});

        // 2) 중계 프로그램 멈추고 → 백업 → 교체
        await stopChild();
        fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
        const backedUp = [];
        for (const file of manifest.files) {
            const target = path.join(ROOT, file.path);
            if (fs.existsSync(target)) {
                copyFileSafe(target, path.join(BACKUP_DIR, file.path));
                backedUp.push(file.path);
            }
        }
        fs.writeFileSync(path.join(BACKUP_DIR, 'files.json'), JSON.stringify(backedUp));
        for (const file of manifest.files) copyFileSafe(path.join(STAGING_DIR, file.path), path.join(ROOT, file.path));
        fs.rmSync(STAGING_DIR, { recursive: true, force: true });

        // 3) 필요한 부품이 바뀌었으면 설치
        if (dependenciesChanged) {
            log('INFO', '필요한 부품이 바뀌어 설치하는 중...');
            const result = spawnSync(npmCmd, ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: ROOT, shell: true, windowsHide: true });
            if (result.status !== 0) log('WARN', '부품 설치 중 경고가 있었습니다. (계속 진행)');
        }
        quickCrashes = 0;
        log('INFO', `업데이트 완료 → v${manifest.version}`);
    } catch (error) {
        log('ERROR', `업데이트 실패 (기존 버전 유지): ${error.message}`);
        fs.rmSync(STAGING_DIR, { recursive: true, force: true });
    } finally {
        startChild();
    }
};

// ---------------------------------------------------------------------------
const shutdown = async () => {
    stopping = true;
    await stopChild();
    process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

log('INFO', `런처 시작 (현재 v${localVersion()}, 업데이트 주소 ${updateBaseUrl()})`);
await checkForUpdate();
startChild();
setInterval(checkForUpdate, UPDATE_CHECK_MS);
