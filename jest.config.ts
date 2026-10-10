import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['<rootDir>/__tests__/{unit,integration}/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: { module: 'commonjs' },
    }],
  },
  setupFiles: ['<rootDir>/__tests__/setup.ts'],
  testTimeout: 15000,
  // Database integration suites share the single provider-budget row; parallel workers would clobber it.
  ...(process.env.TEST_DATABASE_URL ? { maxWorkers: 1 } : {}),
}

export default config
