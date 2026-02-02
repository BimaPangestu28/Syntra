import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export async function cloneRepository(
  workDir: string,
  repoUrl: string,
  branch: string,
  commitSha?: string,
): Promise<string> {
  const repoPath = path.join(workDir, 'repo');

  const cloneCmd = `git clone --depth 1 --branch ${branch} ${repoUrl} ${repoPath}`;
  await execAsync(cloneCmd);

  if (commitSha) {
    await execAsync(
      `cd ${repoPath} && git fetch --depth 1 origin ${commitSha} && git checkout ${commitSha}`,
    );
  }

  return repoPath;
}
