import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      MONGO_URI: process.env.MONGO_TEST_URI || 'mongodb://127.0.0.1:27017/estateflow_test',
      JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-123',
      FILE_SIGNING_SECRET: 'test-file-secret-test-file-secret-123456',
      USE_TRANSACTIONS: process.env.MONGO_TEST_TX || 'false',
      LOG_LEVEL: 'silent',
    },
  },
});
