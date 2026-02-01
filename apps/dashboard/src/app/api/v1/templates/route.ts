import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { serviceTemplates } from '@/lib/db/schema';
import { eq, desc, like, or } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// GET /api/v1/templates - List service templates
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const official = searchParams.get('official');

    const templates = await db.query.serviceTemplates.findMany({
      where: (t, { and: andWhere, eq: eqWhere, like: likeWhere, or: orWhere }) => {
        const conditions = [eqWhere(t.isPublic, true)];
        if (category) conditions.push(eqWhere(t.category, category));
        if (official === 'true') conditions.push(eqWhere(t.isOfficial, true));
        if (search) {
          conditions.push(
            orWhere(
              likeWhere(t.name, `%${search}%`),
              likeWhere(t.description, `%${search}%`)
            )!
          );
        }
        return andWhere(...conditions);
      },
      orderBy: [desc(serviceTemplates.usageCount), desc(serviceTemplates.createdAt)],
    });

    return NextResponse.json({
      success: true,
      data: templates.map(t => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description,
        category: t.category,
        icon_url: t.iconUrl,
        docker_image: t.dockerImage,
        default_port: t.defaultPort,
        default_env_vars: t.defaultEnvVars,
        default_resources: t.defaultResources,
        health_check_path: t.healthCheckPath,
        documentation_url: t.documentationUrl,
        tags: t.tags,
        is_official: t.isOfficial,
        usage_count: t.usageCount,
        created_at: t.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/templates error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// GET categories
export async function OPTIONS(req: NextRequest) {
  return NextResponse.json({
    success: true,
    data: {
      categories: ['web', 'api', 'database', 'queue', 'cache', 'monitoring', 'other'],
    },
  });
}
