import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '知序 · 立体几何学习',
  description: '高中立体几何学生端：学习、练习与作答记录。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
