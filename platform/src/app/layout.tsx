import type { Metadata } from 'next';
import { SessionProvider } from '@/features/auth/session';
import { AppShell } from '@/shared/ui/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: '知序 · 立体几何学习',
  description: '高中立体几何学生端：学习、练习与作答记录。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <SessionProvider
          developmentFixtures={
            process.env.NODE_ENV === 'development' && process.env.ZHIXU_DEV_FIXTURES === '1'
          }
        >
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
