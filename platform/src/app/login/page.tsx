import { AuthForm } from '@/features/auth/auth-form';
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; username?: string }>;
}) {
  const query = await searchParams;
  return (
    <AuthForm
      mode="login"
      registered={query.registered === '1'}
      initialUsername={query.username ?? ''}
    />
  );
}
