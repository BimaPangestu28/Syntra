import { getAnthropicClient, MODEL } from './client';

export interface DockerfileContext {
  files: Array<{ path: string; content: string }>;
  packageManager?: string;
  framework?: string;
  language?: string;
}

export interface DockerfileResult {
  dockerfile: string;
  explanation: string;
  buildCommand: string;
  runCommand: string;
  optimizations: string[];
}

/**
 * Generate an optimized Dockerfile from project files
 */
export async function generateDockerfile(context: DockerfileContext): Promise<DockerfileResult> {
  const filesContent = context.files
    .map(f => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``)
    .join('\n\n');

  const prompt = `You are an expert at containerizing applications. Generate an optimized Dockerfile for the following project.

## Project Files
${filesContent}

${context.language ? `**Detected Language**: ${context.language}` : ''}
${context.framework ? `**Framework**: ${context.framework}` : ''}
${context.packageManager ? `**Package Manager**: ${context.packageManager}` : ''}

Generate an optimized Dockerfile following these best practices:
1. Use multi-stage builds to minimize image size
2. Use appropriate base images (alpine when possible)
3. Implement proper layer caching for dependencies
4. Run as non-root user for security
5. Set appropriate environment variables
6. Include health check if applicable

Respond in the following JSON format:
{
  "dockerfile": "The complete Dockerfile content",
  "explanation": "Brief explanation of the Dockerfile structure",
  "buildCommand": "docker build command to use",
  "runCommand": "docker run command example",
  "optimizations": ["List of optimizations applied"]
}

Respond ONLY with the JSON object.`;

  const response = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  try {
    return JSON.parse(content.text) as DockerfileResult;
  } catch {
    return {
      dockerfile: content.text,
      explanation: 'Generated Dockerfile',
      buildCommand: 'docker build -t myapp .',
      runCommand: 'docker run -p 3000:3000 myapp',
      optimizations: [],
    };
  }
}
