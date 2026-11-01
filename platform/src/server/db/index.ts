import 'server-only';
import { Pool, type PoolClient } from 'pg';
import { ApiError } from '@/server/http';

const globalForDb = globalThis as typeof globalThis & { zhixuPool?: Pool };

// 延迟创建连接池，页面启动、构建和健康检查不依赖数据库。
export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new ApiError('SERVICE_UNAVAILABLE', 503, '数据库尚未配置。');
  }
  if (!globalForDb.zhixuPool) {
    globalForDb.zhixuPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
    globalForDb.zhixuPool.on('error', () => {
      console.error('[platform] idle database connection failed');
    });
  }
  return globalForDb.zhixuPool;
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
