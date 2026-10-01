import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitCliffChangelogGenerator } from '../../../../src/infrastructure/changelog/git-cliff-changelog-generator';
import type { GitCliffExecutableProvider } from '../../../../src/infrastructure/changelog/git-cliff-installer';

const execMock = vi.hoisted(() => ({ exec: vi.fn() }));

vi.mock('@actions/exec', () => execMock);

describe('GitCliffChangelogGenerator', () => {
  let executableProvider: MockExecutableProvider;
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-cliff-generator-'));
    executableProvider = new MockExecutableProvider();
    execMock.exec.mockResolvedValue(0);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a changelog when the file does not exist', async () => {
    await new GitCliffChangelogGenerator(executableProvider).generate({ cwd: tempDir, nextVersion: '1.2.4', targetTag: 'v1.2.4' });

    const configPath = execMock.exec.mock.calls[0][1][2] as string;
    expect(execMock.exec).toHaveBeenNthCalledWith(
      1,
      '/tools/git-cliff',
      ['--init', '--config', configPath],
      { cwd: tempDir },
    );
    expect(execMock.exec).toHaveBeenNthCalledWith(
      2,
      '/tools/git-cliff',
      ['--config', configPath, '--unreleased', '--use-branch-tags', '--tag', 'v1.2.4', '--output', 'CHANGELOG.md'],
      { cwd: tempDir },
    );
    expect(fs.existsSync(path.dirname(configPath))).toBe(false);
  });

  it('uses the repository config and prepends a release when the changelog already exists', async () => {
    fs.writeFileSync(path.join(tempDir, 'CHANGELOG.md'), '# Changelog\n');
    fs.writeFileSync(path.join(tempDir, 'cliff.toml'), '[changelog]\n');

    await new GitCliffChangelogGenerator(executableProvider).generate({ cwd: tempDir, nextVersion: '1.2.4', targetTag: 'release-1.2.4' });

    expect(execMock.exec).toHaveBeenCalledOnce();
    expect(execMock.exec).toHaveBeenCalledWith(
      '/tools/git-cliff',
      [
        '--config',
        path.join(tempDir, 'cliff.toml'),
        '--unreleased',
        '--use-branch-tags',
        '--tag',
        'release-1.2.4',
        '--prepend',
        'CHANGELOG.md',
      ],
      { cwd: tempDir },
    );
  });

  it('adds context to installation and execution errors', async () => {
    executableProvider.install.mockRejectedValue(new Error('download unavailable'));

    await expect(new GitCliffChangelogGenerator(executableProvider).generate({
      cwd: tempDir,
      nextVersion: '1.2.4',
      targetTag: 'v1.2.4',
    })).rejects.toThrow('git-cliff changelog generation failed: download unavailable');
  });
});

class MockExecutableProvider implements GitCliffExecutableProvider {
  readonly install = vi.fn<GitCliffExecutableProvider['install']>().mockResolvedValue('/tools/git-cliff');
}
