import mongoose, { ClientSession } from 'mongoose';
import { env } from './env';
import { logger } from './logger';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  logger.info('MongoDB connected');
}

/**
 * Runs fn inside a transaction when USE_TRANSACTIONS=true (requires a replica set).
 * Otherwise runs without a session; callers still rely on atomic single-document
 * updates and unique indexes (see docs/ARCHITECTURE.md).
 */
export async function withTx<T>(fn: (session?: ClientSession) => Promise<T>): Promise<T> {
  if (env.USE_TRANSACTIONS !== 'true') return fn(undefined);
  const session = await mongoose.startSession();
  try {
    let out!: T;
    await session.withTransaction(async () => {
      out = await fn(session);
    });
    return out;
  } finally {
    await session.endSession();
  }
}
