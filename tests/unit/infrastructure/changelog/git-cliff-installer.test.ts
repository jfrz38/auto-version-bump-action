import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitCliffInstaller } from '../../../../src/infrastructure/changelog/git-cliff-installer';

const VERSION = '2.14.2';
const CHECKSUM = '9a1263f24e59a2f508c7b3d3283c9dea94a8bf697f96dbc18cc783cac6284546';
const LINUX_GNU_ARCHIVE = `git-cliff-${VERSION}-x86_64-unknown-linux-gnu.tar.gz`;

const cryptoMock = vi.hoisted(() => ({
  digest: vi.fn(),
  update: vi.fn(),
}));

const fsMock = vi.hoisted(() => ({ readFile: vi.fn(), readdir: vi.fn() }));

const githubMock = vi.hoisted(() => ({
  getLatestRelease: vi.fn(),
  getOctokit: vi.fn(),
}));

const toolCacheMock = vi.hoisted(() => ({
  cacheFile: vi.fn(),
  downloadTool: vi.fn(),
  extractTar: vi.fn(),
  extractZip: vi.fn(),
  find: vi.fn(),
}));

vi.mock('node:crypto', () => ({
  createHash: vi.fn(() => ({
    update: cryptoMock.update.mockImplementation(() => ({ digest: cryptoMock.digest })),
  })),
}));
vi.mock('node:fs/promises', () => ({ default: fsMock }));
vi.mock('@actions/github', () => ({ getOctokit: githubMock.getOctokit }));
vi.mock('@actions/tool-cache', () => toolCacheMock);

describe('GitCliffInstaller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolCacheMock.find.mockReturnValue('');
    fsMock.readFile.mockResolvedValue(Buffer.from('archive'));
    fsMock.readdir.mockResolvedValue([{ isDirectory: () => false, name: 'git-cliff' }]);
    toolCacheMock.downloadTool.mockResolvedValue('/downloads/git-cliff.tar.gz');
    toolCacheMock.extractTar.mockResolvedValue('/extracted');
    toolCacheMock.cacheFile.mockResolvedValue('/tool-cache/git-cliff');
    cryptoMock.digest.mockReturnValue(CHECKSUM);
    githubMock.getOctokit.mockReturnValue({ rest: { repos: { getLatestRelease: githubMock.getLatestRelease } } });
    setLatestRelease(LINUX_GNU_ARCHIVE);
  });

  it('verifies and extracts an existing cache entry for the latest release without downloading', async () => {
    toolCacheMock.find.mockReturnValue('/tool-cache/git-cliff');

    await expect(new GitCliffInstaller('token', 'linux', 'x64', 'gnu').install()).resolves.toBe(path.join('/extracted', 'git-cliff'));

    expect(githubMock.getLatestRelease).toHaveBeenCalledWith({ owner: 'orhun', repo: 'git-cliff' });
    expect(toolCacheMock.find).toHaveBeenCalledWith('git-cliff', VERSION, 'x64-gnu');
    expect(toolCacheMock.downloadTool).not.toHaveBeenCalled();
    expect(fsMock.readFile).toHaveBeenCalledWith(path.join('/tool-cache/git-cliff', LINUX_GNU_ARCHIVE));
  });

  it('downloads, verifies, caches, and extracts the latest platform asset', async () => {
    await expect(new GitCliffInstaller('token', 'linux', 'x64', 'gnu').install()).resolves.toBe(path.join('/extracted', 'git-cliff'));

    expect(githubMock.getOctokit).toHaveBeenCalledWith('token');
    expect(toolCacheMock.downloadTool).toHaveBeenCalledWith(`https://github.com/orhun/git-cliff/releases/download/v${VERSION}/${LINUX_GNU_ARCHIVE}`);
    expect(toolCacheMock.cacheFile).toHaveBeenCalledWith(
      '/downloads/git-cliff.tar.gz',
      LINUX_GNU_ARCHIVE,
      'git-cliff',
      VERSION,
      'x64-gnu',
    );
  });

  it('rejects a release asset without a SHA-256 digest', async () => {
    setLatestRelease(LINUX_GNU_ARCHIVE, null);

    await expect(new GitCliffInstaller('token', 'linux', 'x64', 'gnu').install()).rejects.toThrow(
      `Latest git-cliff release does not publish a SHA-256 digest for ${LINUX_GNU_ARCHIVE}.`,
    );
    expect(toolCacheMock.downloadTool).not.toHaveBeenCalled();
  });

  it('rejects an archive with a different checksum', async () => {
    cryptoMock.digest.mockReturnValue('invalid');

    await expect(new GitCliffInstaller('token', 'linux', 'x64', 'gnu').install()).rejects.toThrow(
      `Checksum verification failed for ${LINUX_GNU_ARCHIVE}.`,
    );
    expect(toolCacheMock.extractTar).not.toHaveBeenCalled();
  });

  it('selects the musl asset on musl-based Linux runners', async () => {
    const archive = `git-cliff-${VERSION}-x86_64-unknown-linux-musl.tar.gz`;
    setLatestRelease(archive);

    await new GitCliffInstaller('token', 'linux', 'x64', 'musl').install();

    expect(toolCacheMock.downloadTool).toHaveBeenCalledWith(`https://github.com/orhun/git-cliff/releases/download/v${VERSION}/${archive}`);
  });

  it('selects and extracts the Windows zip asset', async () => {
    const archive = `git-cliff-${VERSION}-x86_64-pc-windows-msvc.zip`;
    setLatestRelease(archive);
    fsMock.readdir.mockResolvedValue([{ isDirectory: () => false, name: 'git-cliff.exe' }]);
    toolCacheMock.extractZip.mockResolvedValue('/extracted');

    await new GitCliffInstaller('token', 'win32', 'x64').install();

    expect(toolCacheMock.extractZip).toHaveBeenCalledWith(path.join('/tool-cache/git-cliff', archive));
  });

  it('rejects unsupported platforms before querying GitHub', async () => {
    await expect(new GitCliffInstaller('token', 'freebsd', 'x64').install()).rejects.toThrow('Unsupported platform for git-cliff: freebsd-x64.');
    expect(githubMock.getOctokit).not.toHaveBeenCalled();
  });

  function setLatestRelease(archive: string, digest: string | null = `sha256:${CHECKSUM}`): void {
    githubMock.getLatestRelease.mockResolvedValue({
      data: {
        assets: [{
          browser_download_url: `https://github.com/orhun/git-cliff/releases/download/v${VERSION}/${archive}`,
          digest,
          name: archive,
        }],
        tag_name: `v${VERSION}`,
      },
    });
  }
});
