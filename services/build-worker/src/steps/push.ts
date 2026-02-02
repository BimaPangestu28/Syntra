import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function pushImage(
  imageName: string,
  registryUrl: string,
  username?: string,
  password?: string,
): Promise<string> {
  const registryImage = `${registryUrl}/${imageName}`;

  // Tag the image for the registry
  await execAsync(`docker tag ${imageName} ${registryImage}`);

  // Login if credentials are provided
  if (username && password) {
    await execAsync(
      `echo "${password}" | docker login ${registryUrl} -u ${username} --password-stdin`,
    );
  }

  // Push the image
  try {
    await execAsync(`docker push ${registryImage}`);
    return registryImage;
  } catch (error: any) {
    throw new Error(`Failed to push image: ${error.message}`);
  }
}
