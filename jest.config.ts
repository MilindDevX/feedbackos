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
}

export default config
