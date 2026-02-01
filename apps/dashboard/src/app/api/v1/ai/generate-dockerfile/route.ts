import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generateDockerfile, DockerfileContext } from '@/lib/ai';
import crypto from 'crypto';

// Detect language and framework from files
function detectProjectType(files: Array<{ path: string; content: string }>) {
  let language: string | undefined;
  let framework: string | undefined;
  let packageManager: string | undefined;

  for (const file of files) {
    const name = file.path.toLowerCase();
    const content = file.content;

    // Detect package manager and language
    if (name === 'package.json') {
      language = 'javascript';
      packageManager = files.some(f => f.path === 'yarn.lock') ? 'yarn' :
                       files.some(f => f.path === 'pnpm-lock.yaml') ? 'pnpm' : 'npm';

      // Detect framework
      if (content.includes('"next"')) framework = 'Next.js';
      else if (content.includes('"express"')) framework = 'Express';
      else if (content.includes('"fastify"')) framework = 'Fastify';
      else if (content.includes('"nestjs"')) framework = 'NestJS';
      else if (content.includes('"react"')) framework = 'React';
      else if (content.includes('"vue"')) framework = 'Vue';
    }
    else if (name === 'requirements.txt' || name === 'pyproject.toml') {
      language = 'python';
      packageManager = name === 'pyproject.toml' ? 'poetry' : 'pip';

      if (content.includes('fastapi')) framework = 'FastAPI';
      else if (content.includes('django')) framework = 'Django';
      else if (content.includes('flask')) framework = 'Flask';
    }
    else if (name === 'cargo.toml') {
      language = 'rust';
      packageManager = 'cargo';

      if (content.includes('actix-web')) framework = 'Actix-web';
      else if (content.includes('axum')) framework = 'Axum';
      else if (content.includes('rocket')) framework = 'Rocket';
    }
    else if (name === 'go.mod') {
      language = 'go';
      packageManager = 'go mod';

      if (content.includes('gin-gonic')) framework = 'Gin';
      else if (content.includes('echo')) framework = 'Echo';
      else if (content.includes('chi')) framework = 'Chi';
    }
    else if (name === 'gemfile') {
      language = 'ruby';
      packageManager = 'bundler';

      if (content.includes('rails')) framework = 'Rails';
      else if (content.includes('sinatra')) framework = 'Sinatra';
    }
    else if (name === 'composer.json') {
      language = 'php';
      packageManager = 'composer';

      if (content.includes('laravel')) framework = 'Laravel';
      else if (content.includes('symfony')) framework = 'Symfony';
    }
  }

  return { language, framework, packageManager };
}

// POST /api/v1/ai/generate-dockerfile - Generate Dockerfile from project files
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { files, language, framework, package_manager } = body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'files array is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Validate file structure
    for (const file of files) {
      if (!file.path || typeof file.content !== 'string') {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Each file must have path and content', request_id: crypto.randomUUID() } },
          { status: 400 }
        );
      }
    }

    // Auto-detect if not provided
    const detected = detectProjectType(files);

    const context: DockerfileContext = {
      files,
      language: language || detected.language,
      framework: framework || detected.framework,
      packageManager: package_manager || detected.packageManager,
    };

    const result = await generateDockerfile(context);

    return NextResponse.json({
      success: true,
      data: {
        dockerfile: result.dockerfile,
        explanation: result.explanation,
        build_command: result.buildCommand,
        run_command: result.runCommand,
        optimizations: result.optimizations,
        detected: {
          language: context.language,
          framework: context.framework,
          package_manager: context.packageManager,
        },
      },
    });
  } catch (error) {
    console.error('POST /api/v1/ai/generate-dockerfile error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
