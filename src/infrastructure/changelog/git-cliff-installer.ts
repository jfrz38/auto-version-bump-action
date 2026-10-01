import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const TOOL_NAME = 'git-cliff';
const VERSION = '2.13.1';
const RELEASE_URL = `https://github.com/orhun/git-cliff/releases/download/v${VERSION}`;

interface GitCliffAsset {
  archive: string;
  checksum: string;
  format: 'tar' | 'zip';
}

type LinuxLibc = 'gnu' | 'musl';

const ASSETS: Record<string, GitCliffAsset> = {
  'darwin-arm64': {
    archive: `git-cliff-${VERSION}-aarch64-apple-darwin.tar.gz`,
    checksum: '21547ae4a0421164070ab75c2522864ea5565858a011fabc5f583061b20f1226',
    format: 'tar',
  },
  'darwin-x64': {
    archive: `git-cliff-${VERSION}-x86_64-apple-darwin.tar.gz`,
    checksum: '6e60ae390d375cecb9d8008c49f0e724a8dfe40390b532ef5501e421d2cc8acb',
    format: 'tar',
  },
  'linux-gnu-arm64': {
    archive: `git-cliff-${VERSION}-aarch64-unknown-linux-gnu.tar.gz`,
    checksum: '9619b7f0c584229f8a2331c1905afe88bd938bdc9102926c2073836a42f02455',
    format: 'tar',
  },
  'linux-gnu-x64': {
    archive: `git-cliff-${VERSION}-x86_64-unknown-linux-gnu.tar.gz`,
    checksum: '9a1263f24e59a2f508c7b3d3283c9dea94a8bf697f96dbc18cc783cac6284546',
    format: 'tar',
  },
  'linux-musl-arm64': {
    archive: `git-cliff-${VERSION}-aarch64-unknown-linux-musl.tar.gz`,
    checksum: '4054c124b926c117f3fa048939bc8be0a954f29f3b6f367627e8cb22c1971882',
    format: 'tar',
  },
  'linux-musl-x64': {
    archive: `git-cliff-${VERSION}-x86_64-unknown-linux-musl.tar.gz`,
    checksum: '200d2535da6d9703f3bcc8a4d159c3b55eacdb01cf2148c55b3eee9dd04d5249',
    format: 'tar',
  },
  'win32-arm64': {
    archive: `git-cliff-${VERSION}-aarch64-pc-windows-msvc.zip`,
    checksum: '03a623191fe575bc0024e2ebc61cc861cebd3ba84b93ff13b002c42e8248cd3f',
    format: 'zip',
  },
  'win32-x64': {
    archive: `git-cliff-${VERSION}-x86_64-pc-windows-msvc.zip`,
    checksum: '3ae3a5549e85c7ad5b20192ebcfee4371269deca51255f6f2f2e051c6541f5ca',
    format: 'zip',
  },
};

export interface GitCliffExecutableProvider {
  install(): Promise<string>;
}

export class GitCliffInstaller implements GitCliffExecutableProvider {
  constructor(
    private readonly platform = process.platform,
    private readonly architecture = process.arch,
    private readonly linuxLibc = detectLinuxLibc(platform),
  ) {}

  async install(): Promise<string> {
    const platformKey = this.platform === 'linux' ? `${this.platform}-${this.linuxLibc}` : this.platform;
    const asset = ASSETS[`${platformKey}-${this.architecture}`];
    if (!asset) {
      throw new Error(`Unsupported platform for git-cliff: ${this.platform}-${this.architecture}.`);
    }

    const toolCache = await import('@actions/tool-cache');
    const cacheArchitecture = this.platform === 'linux' ? `${this.architecture}-${this.linuxLibc}` : this.architecture;
    const cachedDirectory = toolCache.find(TOOL_NAME, VERSION, cacheArchitecture);
    let archivePath: string;
    if (cachedDirectory) {
      archivePath = path.join(cachedDirectory, asset.archive);
    } else {
      const downloadPath = await toolCache.downloadTool(`${RELEASE_URL}/${asset.archive}`);
      await this.assertChecksum(downloadPath, asset);
      const installedDirectory = await toolCache.cacheFile(downloadPath, asset.archive, TOOL_NAME, VERSION, cacheArchitecture);
      archivePath = path.join(installedDirectory, asset.archive);
    }

    await this.assertChecksum(archivePath, asset);
    const extractedDirectory = asset.format === 'zip'
      ? await toolCache.extractZip(archivePath)
      : await toolCache.extractTar(archivePath);
    return this.findExecutable(extractedDirectory);
  }

  private async assertChecksum(downloadPath: string, asset: GitCliffAsset): Promise<void> {
    const checksum = createHash('sha256').update(await fs.readFile(downloadPath)).digest('hex');
    if (checksum !== asset.checksum) {
      throw new Error(`Checksum verification failed for ${asset.archive}.`);
    }
  }

  private async findExecutable(directory: string): Promise<string> {
    const executableName = this.platform === 'win32' ? 'git-cliff.exe' : 'git-cliff';
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

function detectLinuxLibc(platform: NodeJS.Platform): LinuxLibc | undefined {
  if (platform !== 'linux') {
    return undefined;
  }

  const report = process.report?.getReport() as { header?: Record<string, unknown> } | undefined;
  const header = report?.header;
  return typeof header?.glibcVersionRuntime === 'string' ? 'gnu' : 'musl';
}
