'use client';
import { ErrorState } from '@/shared/ui/common';
export default function AppError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      message="页面暂时无法读取。已提交的记录不受页面错误影响，请重新尝试。"
      retry={reset}
    />
  );
}
