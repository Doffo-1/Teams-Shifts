import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    return NextResponse.json(user);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to get auth session' },
      { status: 500 }
    );
  }
}
