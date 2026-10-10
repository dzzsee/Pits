/**
 * Comprueba que una contrasena corresponde a un hash guardado.
 * Uso: npx tsx scripts/check-password.ts <hash> <candidato...>
 */
import { verifyPassword } from '../src/lib/password.js'

const [, , hash, ...candidates] = process.argv

if (!hash || candidates.length === 0) {
  console.log('uso: tsx scripts/check-password.ts <hash> <candidato...>')
  process.exit(2)
}

for (const candidate of candidates) {
  const ok = await verifyPassword(hash, candidate)
  console.log(`${ok ? 'MATCH' : 'no   '}  ${candidate}`)
}
