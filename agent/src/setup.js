import readline from 'node:readline';
import { loadDefaults, readRawConfig, resolveDentwebConfig, saveConfig, saveDefaults } from './config.js';
import { closeDentweb, connectDentweb } from './dentweb.js';
import { connectSupabase, fetchEmrSettings } from './uploader.js';

// 대화형 설치: 질문에 답하면 config.json / defaults.json 을 만들고 연결까지 확인합니다.
// 비밀번호는 입력할 때 화면에 보이지 않습니다. (Enter 만 누르면 기존 값 유지)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
rl._writeToOutput = (text) => {
    if (!muted) rl.output.write(text);
    else if (text.includes('\n')) rl.output.write('\n');
};

const ask = (question, { hidden = false, current = '' } = {}) => new Promise(resolve => {
    const hint = current ? (hidden ? ' [Enter=기존 값 유지]' : ` [Enter=${current}]`) : '';
    rl.question(`  ${question}${hint}: `, (answer) => {
        muted = false;
        if (hidden) process.stdout.write('\n');
        resolve(String(answer || '').trim() || current);
    });
    muted = hidden;
});

const line = (text = '') => console.log(text);
const ok = (text) => console.log(`  ✅ ${text}`);
const fail = (text) => console.log(`  ❌ ${text}`);

const main = async () => {
    line('');
    line('==============================================');
    line('  아크덴트 EMR 중계 프로그램 설정');
    line('==============================================');

    // 1. 공통값 (Supabase) — 다른 치과에서 복사해 온 defaults.json 이 있으면 묻지 않습니다.
    const raw = readRawConfig() || {};
    let defaults = loadDefaults();
    const legacyUrl = raw.supabase?.url && !/프로젝트ID/.test(raw.supabase.url) ? raw.supabase.url : '';
    const legacyKey = raw.supabase?.anonKey && !/Supabase_anon/.test(raw.supabase.anonKey) ? raw.supabase.anonKey : '';
    if (!defaults.supabaseUrl || !defaults.supabaseAnonKey) {
        if (legacyUrl && legacyKey) {
            defaults = { supabaseUrl: legacyUrl, supabaseAnonKey: legacyKey };
        } else {
            line('');
            line('[공통 설정] 처음 한 번만 입력합니다. (다른 치과 설치 때는 defaults.json 을 같이 복사하면 생략)');
            defaults.supabaseUrl = await ask('Supabase 주소 (https://….supabase.co)');
            defaults.supabaseAnonKey = await ask('Supabase anon key', { hidden: true });
        }
        saveDefaults(defaults);
    }

    // 2. 이 치과 전용 정보
    line('');
    line('[이 치과 정보]');
    const agentEmail = await ask('중계 계정 이메일 (예: barum-agent@arcdent.local)', { current: /치과코드/.test(raw.supabase?.agentEmail || '') ? '' : raw.supabase?.agentEmail || '' });
    const agentPassword = await ask('중계 계정 비밀번호', { hidden: true, current: /중계계정_/.test(raw.supabase?.agentPassword || '') ? '' : raw.supabase?.agentPassword || '' });
    const dentwebUser = await ask('덴트웹 외부연동 아이디', { current: /덴트웹에서_/.test(raw.dentweb?.user || '') ? '' : raw.dentweb?.user || '' });
    const dentwebPassword = await ask('덴트웹 외부연동 비밀번호', { hidden: true, current: /덴트웹에서_/.test(raw.dentweb?.password || '') ? '' : raw.dentweb?.password || '' });

    const config = {
        supabase: { agentEmail, agentPassword },
        dentweb: {
            // 서버 주소는 관리자모드(EMR 연동)에서 받아옵니다. 아래는 예비값입니다.
            server: raw.dentweb?.server || '',
            instance: raw.dentweb?.instance || 'DENTWEB',
            port: Number(raw.dentweb?.port) || 1436,
            database: raw.dentweb?.database || 'DentWeb',
            user: dentwebUser,
            password: dentwebPassword,
        },
        intervalSeconds: Number(raw.intervalSeconds) || 180,
    };
    saveConfig(config);
    ok('설정 파일 저장 완료');

    // 3. 연결 확인
    line('');
    line('[연결 확인]');
    let info;
    try {
        info = await connectSupabase({ url: defaults.supabaseUrl, anonKey: defaults.supabaseAnonKey, agentEmail, agentPassword });
        ok(`아크덴트 로그인 성공 — 대상 치과: ${info.clinicName || info.clinicId}`);
    } catch (error) {
        fail(error.message);
        line('  → 중계 계정 이메일/비밀번호를 확인하고 setup.bat 을 다시 실행하세요.');
        return 1;
    }

    let remote = null;
    try {
        remote = await fetchEmrSettings();
    } catch (error) {
        fail(error.message);
    }
    if (!remote?.server) {
        line('  ⚠️ 관리자모드 → EMR 연동에 이 치과의 덴트웹 서버 IP가 아직 없습니다.');
        const server = await ask('지금 사용할 덴트웹 서버 IP (덴트웹 서버 PC면 127.0.0.1)', { current: config.dentweb.server || '127.0.0.1' });
        const port = await ask('포트', { current: String(config.dentweb.port || 1436) });
        config.dentweb.server = server;
        config.dentweb.port = Number(port) || 1436;
        saveConfig(config);
        line('  → 원격으로 관리하려면 관리자모드 → EMR 연동에도 같은 값을 입력해 주세요.');
    } else if (remote.enabled === false) {
        line('  ⚠️ 관리자모드에서 이 치과 연동이 "중지" 상태입니다. 켜야 전송됩니다.');
    }

    try {
        const dentweb = resolveDentwebConfig(config.dentweb, remote);
        line(`  덴트웹 접속 중: ${dentweb.server}${dentweb.port ? `,${dentweb.port}` : ''} (${dentweb.source} 기준)`);
        await connectDentweb(dentweb);
        ok('덴트웹 접속 성공');
    } catch (error) {
        fail(`덴트웹 접속 실패: ${error.message}`);
        line('  → 서버 IP/포트, 덴트웹 아이디/비밀번호를 확인하세요. 다른 PC라면 서버 PC 방화벽 1436 포트도 확인하세요.');
        return 1;
    } finally {
        await closeDentweb();
    }

    line('');
    line('설정이 끝났습니다. 다음 순서로 진행하세요.');
    line('  1) check.bat      → 숫자가 덴트웹과 맞는지 확인');
    line('  2) send-once.bat  → 1회 전송 후 아크덴트 홈 화면 확인');
    line('  3) install-task.bat (마우스 오른쪽 → 관리자 권한으로 실행) → 자동 실행 등록');
    return 0;
};

main()
    .then(code => { rl.close(); process.exit(code); })
    .catch(error => { fail(error.message); rl.close(); process.exit(1); });
