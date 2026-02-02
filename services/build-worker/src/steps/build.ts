import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export async function buildImage(
  repoPath: string,
  dockerfile: string,
  imageName: string,
  buildArgs?: Record<string, string>,
): Promise<string> {
  const dockerfilePath = path.join(repoPath, dockerfile);

  try {
    await fs.access(dockerfilePath);
  } catch {
    throw new Error(`Dockerfile not found at: ${dockerfile}`);
  }

  let buildArgsStr = '';
  if (buildArgs) {
    buildArgsStr = Object.entries(buildArgs)
      .map(([key, value]) => `--build-arg ${key}="${value}"`)
      .join(' ');
  }

  const buildCmd = `cd ${repoPath} && docker build -t ${imageName} -f ${dockerfile} ${buildArgsStr} .`;

  try {
    const { stdout, stderr } = await execAsync(buildCmd, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });

    return imageName;
  } catch (error: any) {
    const errorOutput = error.stderr || error.stdout || error.message;
    throw new Error(`Docker build failed: ${errorOutput}`);
  }
}
