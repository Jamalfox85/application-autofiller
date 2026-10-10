// Dev-only: grant the unpacked dev build access to the local resume API.
import { readFileSync, writeFileSync } from 'node:fs'
const p = 'dist/manifest.json'
const m = JSON.parse(readFileSync(p, 'utf8'))
if (!m.host_permissions.includes('http://localhost:8080/*')) m.host_permissions.push('http://localhost:8080/*')
m.content_security_policy.extension_pages = m.content_security_policy.extension_pages.replace(
  'connect-src ',
  'connect-src http://localhost:8080 ',
)
writeFileSync(p, JSON.stringify(m, null, 2) + '\n')
console.log('DEV BUILD: dist/manifest.json now allows http://localhost:8080. Never ship this build.')
