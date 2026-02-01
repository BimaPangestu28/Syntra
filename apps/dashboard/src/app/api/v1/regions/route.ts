import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { regions, serviceRegions } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import crypto from 'crypto';

// GET /api/v1/regions - List available regions
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider');
    const activeOnly = searchParams.get('active_only') !== 'false';

    const regionList = await db.query.regions.findMany({
      where: (r, { and: andWhere, eq: eqWhere }) => {
        const conditions = [];
        if (activeOnly) conditions.push(eqWhere(r.isActive, true));
        if (provider) conditions.push(eqWhere(r.provider, provider));
        return conditions.length > 0 ? andWhere(...conditions) : undefined;
      },
      orderBy: [desc(regions.createdAt)],
    });

    return NextResponse.json({
      success: true,
      data: regionList.map(r => ({
        id: r.id,
        name: r.name,
        display_name: r.displayName,
        code: r.code,
        provider: r.provider,
        latitude: r.latitude,
        longitude: r.longitude,
        is_active: r.isActive,
        created_at: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/regions error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
