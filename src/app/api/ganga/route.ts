import { NextResponse } from 'next/server';
import { getGangaLogs, getGangaStats, getCompanyConfig } from '@/lib/queries';

export async function GET() {
  try {
    const config = getCompanyConfig();
    const logs = getGangaLogs(50);
    const stats = getGangaStats();

    return NextResponse.json({
      enabled: !!config.ganga_enabled,
      scope: config.ganga_scope,
      logs,
      stats,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to load ganga data' },
      { status: 500 },
    );
  }
}
