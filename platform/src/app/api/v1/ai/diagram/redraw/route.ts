import type { NextRequest } from 'next/server';
import { redrawDiagram } from '@/server/ai/redraw';
import { practiceResponse, readJson } from '@/server/practice/request';
import { success } from '@/server/http';

export async function POST(request: NextRequest) {
  return practiceResponse(request, async () =>
    success(await redrawDiagram(await readJson(request))),
  );
}
