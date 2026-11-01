import Link from 'next/link';
import { EmptyState } from '@/shared/ui/common';
export default function NotFound() {
  return (
    <EmptyState title="没有找到这个页面">
      <p>链接可能已失效，请从学习目录重新进入。</p>
      <Link className="btn primary" href="/learn">
        返回学习目录
      </Link>
    </EmptyState>
  );
}
