// 维护人：王宁岳。业务契约 v2，覆盖文档 Q01—Q24。
export * from './learning';
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'NOT_IMPLEMENTED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export type ApiResponse<T> =
  { data: T; error: null } | { data: null; error: { code: ApiErrorCode; message: string } };

export interface CurrentUser {
  id: string;
  username: string;
}

export interface HealthStatus {
  status: 'ok';
  service: 'zhixu-platform';
  timestamp: string;
}

export interface Figure {
  id: string;
  src: string;
  alt: string;
  caption: string;
}

export type PracticeStatus = 'OPEN' | 'SUBMITTED';
