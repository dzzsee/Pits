/**
 * Comprueba que contrasena corresponde a un hash argon2id guardado.
 * Uso: npx tsx scripts/check-password.ts <hash> <candidato...>
 */
import argon2 from 'argon2'

const [, , hash, ...candidates] = process.argv

if (!hash || candidates.length === 0) {
  console.log('uso: tsx scripts/check-password.ts <hash> <candidato...>')
  process.exit(2)
}

for (const candidate of candidates) {
  const ok = await argon2.verify(hash, candidate)
  console.log(`${ok ? 'MATCH' : 'no   '}  ${candidate}`)
}
