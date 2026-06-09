import { z } from 'zod'

/**
 * Validates all required environment variables at startup using Zod.
 * Call this once at the top of the worker and optionally in lib/db.ts.
 * Throws on missing/invalid values so the process crashes early with a clear message.
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // AI
  OPENROUTER_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  // NextAuth
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),

  // Encryption
  ENCRYPTION_KEY: z.string().min(64, 'ENCRYPTION_KEY must be a 32-byte hex string (64 chars)'),

  // Optional but warn if missing
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export type Env = z.infer<typeof envSchema>

let validated: Env | null = null

export function validateEnv(): Env {
  if (validated) return validated

  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ❌ ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`\n\n🚨 Invalid environment configuration:\n${issues}\n\nPlease check your .env file.\n`)
  }

  validated = result.data
  return validated
}
