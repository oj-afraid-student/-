import type { NextRequest } from 'next/server';
import { success } from '@/server/http';
import { authResponse, readCredentials } from '@/server/auth/request';
import { registerUser } from '@/server/auth/service';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  return authResponse(request, async () =>
    success(await registerUser(await readCredentials(request)), 201),
  );
}
