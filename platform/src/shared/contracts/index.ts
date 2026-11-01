// 维护人：王宁岳。首日仅提供工程所需公共类型，业务字段由接口负责人继续完善。
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
