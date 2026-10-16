import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 빌드할 때마다 중계 프로그램 자동 업데이트 묶음(public/agent)을 먼저 만듭니다.
// (Vercel 배포 → https://arcdent.vercel.app/agent/manifest.json)
const agentBundle = () => ({
    name: 'arcdent-agent-bundle',
    config(_, { command }) {
        if (command === 'build') {
            execFileSync(process.execPath, ['scripts/build-agent-bundle.mjs'], { stdio: 'inherit' })
        }
    },
})

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [agentBundle(), react()],
})
