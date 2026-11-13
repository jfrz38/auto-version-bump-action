import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as github from '@actions/github';

const TOOL_NAME = 'git-cliff';
const GITHUB_OWNER = 'orhun';
const GITHUB_REPOSITORY = 'git-cliff';

interface GitCliffAssetTarget {
  archiveSuffix: string;
}

type LinuxLibc = 'gnu' | 'musl';

const ASSETS: Record<string, GitCliffAssetTarget> = {
  'linux-gnu-arm64': {
    archiveSuffix: 'aarch64-unknown-linux-gnu.tar.gz',
  },
  'linux-gnu-x64': {
    archiveSuffix: 'x86_64-unknown-linux-gnu.tar.gz',
  },
  'linux-musl-arm64': {
    archiveSuffix: 'aarch64-unknown-linux-musl.tar.gz',
  },
  'linux-musl-x64': {
    archiveSuffix: 'x86_64-unknown-linux-musl.tar.gz',
  },
};

export interface GitCliffExecutableProvider {
  install(): Promise<string>;
}

export class GitCliffInstaller implements GitCliffExecutableProvider {
  constructor(
    private readonly githubToken: string,
    private readonly platform = process.platform,
    private readonly architecture = process.arch,
    private readonly linuxLibc = detectLinuxLibc(platform),
  ) {}

  async install(): Promise<string> {
    if (this.platform !== 'linux') {
      throw new Error(`Unsupported platform for git-cliff: ${this.platform}-${this.architecture}.`);
    }

    const asset = ASSETS[`linux-${this.linuxLibc}-${this.architecture}`];
    if (!asset) {
      throw new Error(`Unsupported platform for git-cliff: ${this.platform}-${this.architecture}.`);
    }

    const release = await github.getOctokit(this.githubToken).rest.repos.getLatestRelease({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPOSITORY,
    });
    const version = release.data.tag_name.replace(/^v/, '');
    const archiveName = `git-cliff-${version}-${asset.archiveSuffix}`;
    const releaseAsset = release.data.assets.find(({ name }) => name === archiveName);
    if (!releaseAsset) {
      throw new Error(`Latest git-cliff release ${release.data.tag_name} does not contain ${archiveName}.`);
    }
    const checksum = parseSha256Digest(releaseAsset.digest, archiveName);

    const toolCache = await import('@actions/tool-cache');
    const cacheArchitecture = `${this.architecture}-${this.linuxLibc}`;
    const cachedDirectory = toolCache.find(TOOL_NAME, version, cacheArchitecture);
    let archivePath: string;
    if (cachedDirectory) {
      archivePath = path.join(cachedDirectory, archiveName);
    } else {
      const downloadPath = await toolCache.downloadTool(releaseAsset.browser_download_url);
      await this.assertChecksum(downloadPath, archiveName, checksum);
      const installedDirectory = await toolCache.cacheFile(downloadPath, archiveName, TOOL_NAME, version, cacheArchitecture);
      archivePath = path.join(installedDirectory, archiveName);
    }

    await this.assertChecksum(archivePath, archiveName, checksum);
    const extractedDirectory = await toolCache.extractTar(archivePath);
    return this.findExecutable(extractedDirectory);
  }

  private async assertChecksum(downloadPath: string, archiveName: string, expectedChecksum: string): Promise<void> {
    const checksum = createHash('sha256').update(await fs.readFile(downloadPath)).digest('hex');
    if (checksum !== expectedChecksum) {
      throw new Error(`Checksum verification failed for ${archiveName}.`);
    }
  }

  private async findExecutable(directory: string): Promise<string> {
    const executableName = 'git-cliff';
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        try {
          return await this.findExecutable(entryPath);
        } catch {
          continue;
        }
      }
      if (entry.name === executableName) {
        return entryPath;
      }
    }

    throw new Error(`Downloaded git-cliff archive does not contain ${executableName}.`);
  }
}

function parseSha256Digest(digest: string | null, archiveName: string): string {
  const match = /^sha256:([a-f0-9]{64})$/i.exec(digest ?? '');
  if (!match) {
    throw new Error(`Latest git-cliff release does not publish a SHA-256 digest for ${archiveName}.`);
  }

  return match[1].toLowerCase();
}

function detectLinuxLibc(platform: NodeJS.Platform): LinuxLibc | undefined {
  if (platform !== 'linux') {
    return undefined;
  }

  const report = process.report?.getReport() as { header?: Record<string, unknown> } | undefined;
  const header = report?.header;
  return typeof header?.glibcVersionRuntime === 'string' ? 'gnu' : 'musl';
}
