// 중계 프로그램 자동 업데이트용 파일 묶음을 만듭니다. (npm run build 직전에 자동 실행)
// 결과: public/agent/manifest.json + public/agent/files/...  → Vercel 배포 시 https://arcdent.vercel.app/agent/ 로 게시
// 치과 PC의 런처(agent/launcher.js)가 30분마다 manifest 를 확인해서 새 버전이면 내려받습니다.
//
// ※ config.json / defaults.json / logs / node_modules 는 절대 포함하지 않습니다. (비밀번호·치과 정보)
//
// 새 치과 설치용 public/agent/arcdent-agent.zip 도 같이 만듭니다. (관리자모드 → EMR 연동 → 설치 파일 받기)
//   = 위 파일들 + defaults.json(Supabase 주소 · 공개 anon 키, 화면 코드에도 들어 있는 값)
//   config.json · state.json · logs 는 없으므로 setup.bat 에서 그 치과 계정만 새로 입력하면 됩니다.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_DIR = path.join(ROOT, 'agent');
const OUT_DIR = path.join(ROOT, 'public', 'agent');

const pick = (dir, pattern) => fs.readdirSync(path.join(AGENT_DIR, dir))
    .filter(name => pattern.test(name))
    .map(name => (dir === '.' ? name : `${dir}/${name}`));

const files = [
    ...pick('src', /^[A-Za-z0-9_-]+\.js$/),
    ...pick('.', /^(package\.json|package-lock\.json|launcher\.js|README\.md|[A-Za-z0-9_-]+\.(bat|ps1))$/),
].sort();

const forbidden = files.filter(file => /config\.json$|defaults\.json$/.test(file));
if (forbidden.length) throw new Error(`비밀 파일이 포함되면 안 됩니다: ${forbidden.join(', ')}`);

fs.rmSync(OUT_DIR, { recursive: true, force: true });
const entries = files.map(rel => {
    const buffer = fs.readFileSync(path.join(AGENT_DIR, rel));
    const target = path.join(OUT_DIR, 'files', rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
    return { path: rel, sha256: crypto.createHash('sha256').update(buffer).digest('hex'), size: buffer.length };
});

const version = JSON.parse(fs.readFileSync(path.join(AGENT_DIR, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({
    version,
    publishedAt: new Date().toISOString(),
    files: entries,
}, null, 2));

// ---------------------------------------------------------------- 설치용 zip
const readEnvFile = (name) => {
    try {
        return Object.fromEntries(fs.readFileSync(path.join(ROOT, name), 'utf8').split(/\r?\n/)
            .map(line => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
            .filter(Boolean)
            .map(match => [match[1], match[2]]));
    } catch {
        return {};
    }
};
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };

const sharedDefaults = () => {
    const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local'), ...process.env };
    const local = readJson(path.join(AGENT_DIR, 'defaults.json'));
    const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || local.supabaseUrl || '';
    const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || local.supabaseAnonKey || '';
    return supabaseUrl && supabaseAnonKey ? { supabaseUrl, supabaseAnonKey } : null;
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

/** 폴더 없는 단순 zip (deflate). Windows "압축 풀기"로 바로 열립니다. */
const makeZip = (items) => {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const { name, data } of items) {
        const nameBuf = Buffer.from(name, 'utf8');
        const packed = zlib.deflateRawSync(data, { level: 9 });
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // 파일 이름 UTF-8
        local.writeUInt16LE(8, 8); // deflate
        local.writeUInt16LE(0, 10);
        local.writeUInt16LE(0x21, 12); // 1980-01-01
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(packed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(0x21, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(packed.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt32LE(offset, 42);
        locals.push(local, nameBuf, packed);
        centrals.push(central, nameBuf);
        offset += local.length + nameBuf.length + packed.length;
    }
    const centralSize = centrals.reduce((sum, buf) => sum + buf.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(items.length, 8);
    end.writeUInt16LE(items.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, ...centrals, end]);
};

const zipItems = files.map(rel => ({ name: `arcdent-agent/${rel}`, data: fs.readFileSync(path.join(AGENT_DIR, rel)) }));
const defaults = sharedDefaults();
if (defaults) zipItems.push({ name: 'arcdent-agent/defaults.json', data: Buffer.from(JSON.stringify(defaults, null, 2)) });
if (zipItems.some(item => /config\.json$|state\.json$/.test(item.name))) throw new Error('설치 zip 에 비밀 파일이 들어가면 안 됩니다.');
fs.writeFileSync(path.join(OUT_DIR, 'arcdent-agent.zip'), makeZip(zipItems));
fs.writeFileSync(path.join(OUT_DIR, 'install.json'), JSON.stringify({ version, file: 'arcdent-agent.zip', hasDefaults: Boolean(defaults) }));

console.log(`[agent bundle] v${version} — ${entries.length}개 파일 → public/agent (설치 zip${defaults ? '' : ', defaults.json 없음'})`);
