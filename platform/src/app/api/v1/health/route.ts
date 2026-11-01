import { success } from '@/server/http';
import type { HealthStatus } from '@/shared/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 只检查应用进程；数据库状态由 db:check 单独验证。
export function GET() {
  return success<HealthStatus>({
    status: 'ok',
    service: 'zhixu-platform',
    timestamp: new Date().toISOString(),
  });
}
