// 중계 프로그램 자동 업데이트용 파일 묶음을 만듭니다. (npm run build 직전에 자동 실행)
// 결과: public/agent/manifest.json + public/agent/files/...  → Vercel 배포 시 https://arcdent.vercel.app/agent/ 로 게시
// 치과 PC의 런처(agent/launcher.js)가 30분마다 manifest 를 확인해서 새 버전이면 내려받습니다.
//
// ※ config.json / defaults.json / logs / node_modules 는 절대 포함하지 않습니다. (비밀번호·치과 정보)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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

console.log(`[agent bundle] v${version} — ${entries.length}개 파일 → public/agent`);
