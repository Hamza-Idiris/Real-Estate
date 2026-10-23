import { env } from './config/env';
import { logger } from './config/logger';
import { connectDb } from './config/db';
import { buildApp } from './app';
import { ensureStorage } from './modules/files/storage';
import { runJobs } from './jobs/scheduler';
import mongoose from 'mongoose';

async function main() {
  await connectDb();
  await ensureStorage();
  const app = buildApp();
  const server = app.listen(env.PORT, () => logger.info(`EstateFlow API listening on :${env.PORT} (${env.NODE_ENV})`));
  let timer: NodeJS.Timeout | undefined;
  if (env.RUN_JOBS === 'true') {
    const tick = () => runJobs().catch((e) => logger.error({ err: e }, 'jobs failed'));
    setTimeout(tick, 10_000);
    timer = setInterval(tick, 60 * 60_000);
  }
  const shutdown = async (sig: string) => {
    logger.info({ sig }, 'shutting down');
    if (timer) clearInterval(timer);
    server.close(async () => { await mongoose.disconnect(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
main().catch((e) => { logger.fatal({ err: e }, 'failed to start'); process.exit(1); });
