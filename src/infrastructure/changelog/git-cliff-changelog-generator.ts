import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as exec from '@actions/exec';
import type { ChangelogGenerationRequest, ChangelogGenerator } from '../../domain/ports/changelog-generator';
import type { GitCliffExecutableProvider } from './git-cliff-installer';

export class GitCliffChangelogGenerator implements ChangelogGenerator {
  constructor(private readonly executableProvider: GitCliffExecutableProvider) {}

  async generate(request: ChangelogGenerationRequest): Promise<void> {
    let temporaryConfigDirectory: string | undefined;
    try {
      const executable = await this.executableProvider.install();
      const repositoryConfigPath = path.join(request.cwd, 'cliff.toml');
      let configPath = repositoryConfigPath;
      if (!await fileExists(repositoryConfigPath)) {
        temporaryConfigDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'git-cliff-config-'));
        configPath = path.join(temporaryConfigDirectory, 'cliff.toml');
        await exec.exec(executable, ['--init', '--config', configPath], { cwd: request.cwd });
      }

      const changelogPath = path.join(request.cwd, 'CHANGELOG.md');
      const outputOption = await fileExists(changelogPath) ? '--prepend' : '--output';
      await exec.exec(executable, [
        '--config',
        configPath,
        '--unreleased',
        '--use-branch-tags',
        '--tag',
        request.targetTag,
        outputOption,
        'CHANGELOG.md',
      ], { cwd: request.cwd });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`git-cliff changelog generation failed: ${message}`, { cause: error });
    } finally {
      if (temporaryConfigDirectory) {
        await fs.rm(temporaryConfigDirectory, { recursive: true, force: true });
      }
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
