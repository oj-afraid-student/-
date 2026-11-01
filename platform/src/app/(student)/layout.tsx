import { RequireUser } from '@/features/auth/session';
export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <RequireUser>{children}</RequireUser>;
}
