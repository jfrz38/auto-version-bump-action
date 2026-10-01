import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitCliffInstaller } from '../../../../src/infrastructure/changelog/git-cliff-installer';

const cryptoMock = vi.hoisted(() => ({
  digest: vi.fn(),
  update: vi.fn(),
}));

const fsMock = vi.hoisted(() => ({ readFile: vi.fn(), readdir: vi.fn() }));

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
    cryptoMock.digest.mockReturnValue('9a1263f24e59a2f508c7b3d3283c9dea94a8bf697f96dbc18cc783cac6284546');
  });

  it('verifies and extracts an existing cached archive without downloading', async () => {
    toolCacheMock.find.mockReturnValue('/tool-cache/git-cliff');

    await expect(new GitCliffInstaller('linux', 'x64', 'gnu').install()).resolves.toBe(path.join('/extracted', 'git-cliff'));
    expect(toolCacheMock.downloadTool).not.toHaveBeenCalled();
    expect(fsMock.readFile).toHaveBeenCalledWith(path.join(
      '/tool-cache/git-cliff',
      'git-cliff-2.13.1-x86_64-unknown-linux-gnu.tar.gz',
    ));
    expect(toolCacheMock.extractTar).toHaveBeenCalledWith(path.join(
      '/tool-cache/git-cliff',
      'git-cliff-2.13.1-x86_64-unknown-linux-gnu.tar.gz',
    ));
  });

  it('downloads, verifies, caches, and extracts the pinned platform asset', async () => {
    await expect(new GitCliffInstaller('linux', 'x64', 'gnu').install()).resolves.toBe(path.join('/extracted', 'git-cliff'));

    expect(toolCacheMock.downloadTool).toHaveBeenCalledWith(
      'https://github.com/orhun/git-cliff/releases/download/v2.13.1/git-cliff-2.13.1-x86_64-unknown-linux-gnu.tar.gz',
    );
    expect(toolCacheMock.cacheFile).toHaveBeenCalledWith(
      '/downloads/git-cliff.tar.gz',
      'git-cliff-2.13.1-x86_64-unknown-linux-gnu.tar.gz',
      'git-cliff',
      '2.13.1',
      'x64-gnu',
    );
    expect(toolCacheMock.extractTar).toHaveBeenCalledWith(path.join(
      '/tool-cache/git-cliff',
      'git-cliff-2.13.1-x86_64-unknown-linux-gnu.tar.gz',
    ));
  });

  it('rejects a downloaded asset with a different checksum', async () => {
    cryptoMock.digest.mockReturnValue('invalid');

    await expect(new GitCliffInstaller('linux', 'x64', 'gnu').install()).rejects.toThrow(
      'Checksum verification failed for git-cliff-2.13.1-x86_64-unknown-linux-gnu.tar.gz.',
    );
    expect(toolCacheMock.extractTar).not.toHaveBeenCalled();
  });

  it('rejects a cached archive with a different checksum', async () => {
    toolCacheMock.find.mockReturnValue('/tool-cache/git-cliff');
    cryptoMock.digest.mockReturnValue('invalid');

    await expect(new GitCliffInstaller('linux', 'x64', 'gnu').install()).rejects.toThrow(
      'Checksum verification failed for git-cliff-2.13.1-x86_64-unknown-linux-gnu.tar.gz.',
    );
    expect(toolCacheMock.downloadTool).not.toHaveBeenCalled();
    expect(toolCacheMock.extractTar).not.toHaveBeenCalled();
  });

  it('selects the musl asset on musl-based Linux runners', async () => {
    cryptoMock.digest.mockReturnValue('200d2535da6d9703f3bcc8a4d159c3b55eacdb01cf2148c55b3eee9dd04d5249');

    await new GitCliffInstaller('linux', 'x64', 'musl').install();

    expect(toolCacheMock.downloadTool).toHaveBeenCalledWith(
      'https://github.com/orhun/git-cliff/releases/download/v2.13.1/git-cliff-2.13.1-x86_64-unknown-linux-musl.tar.gz',
    );
  });

  it('adds the zip extension required by Windows before extraction', async () => {
    cryptoMock.digest.mockReturnValue('3ae3a5549e85c7ad5b20192ebcfee4371269deca51255f6f2f2e051c6541f5ca');
    fsMock.readdir.mockResolvedValue([{ isDirectory: () => false, name: 'git-cliff.exe' }]);
    toolCacheMock.extractZip.mockResolvedValue('/extracted');

    await new GitCliffInstaller('win32', 'x64').install();

    expect(toolCacheMock.extractZip).toHaveBeenCalledWith(path.join(
      '/tool-cache/git-cliff',
      'git-cliff-2.13.1-x86_64-pc-windows-msvc.zip',
    ));
  });

  it('rejects unsupported platforms before downloading', async () => {
    await expect(new GitCliffInstaller('freebsd', 'x64').install()).rejects.toThrow('Unsupported platform for git-cliff: freebsd-x64.');
    expect(toolCacheMock.downloadTool).not.toHaveBeenCalled();
  });
});
