// ABOUTME: Vercel build entry point: builds the app, then (production only) applies pending Prisma migrations.
// ABOUTME: Run as the project's build command so schema and code go live in the same deployment.
import { execFileSync } from 'node:child_process'
import { buildSteps, directDatabaseUrl } from '../lib/release-build'

for (const step of buildSteps({ VERCEL_ENV: process.env.VERCEL_ENV })) {
  if (step === 'build') {
    execFileSync('next', ['build'], { stdio: 'inherit' })
  } else {
    console.log('Applying Prisma migrations to the production database (direct connection)')
    execFileSync('prisma', ['migrate', 'deploy'], {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: directDatabaseUrl(process.env.DATABASE_URL) },
    })
  }
}
