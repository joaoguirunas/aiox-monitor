import { NextResponse, type NextRequest } from 'next/server';
import { getCompanyConfig, updateCompanyConfig, isValidTheme } from '@/lib/queries';
import { broadcast } from '@/server/ws-broadcaster';

export async function GET() {
  try {
    const config = getCompanyConfig();
    return NextResponse.json(config);
  } catch {
    return NextResponse.json(
      { error: 'Failed to load company config' },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.theme !== undefined && !isValidTheme(body.theme)) {
      return NextResponse.json({ error: 'Invalid theme' }, { status: 400 });
    }
    if (body.idle_timeout_lounge !== undefined) {
      const val = Number(body.idle_timeout_lounge);
      if (isNaN(val) || val < 60 || val > 1800) {
        return NextResponse.json({ error: 'idle_timeout_lounge must be 60-1800' }, { status: 400 });
      }
    }
    if (body.idle_timeout_break !== undefined) {
      const val = Number(body.idle_timeout_break);
      if (isNaN(val) || val < 300 || val > 3600) {
        return NextResponse.json({ error: 'idle_timeout_break must be 300-3600' }, { status: 400 });
      }
    }

    const updated = updateCompanyConfig(body);

    if (body.theme) {
      try { broadcast({ type: 'theme:change', theme: body.theme }); } catch { /* fire-and-forget */ }
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: 'Failed to update config' },
      { status: 500 },
    );
  }
}
