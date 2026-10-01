import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalGitRepository } from '../../../../src/infrastructure/git/local-git';

const execMock = vi.hoisted(() => ({
  exec: vi.fn(),
  getExecOutput: vi.fn(),
}));

vi.mock('@actions/exec', () => execMock);

describe('LocalGitRepository', () => {
  let repository: LocalGitRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    execMock.exec.mockResolvedValue(0);
    execMock.getExecOutput.mockResolvedValue({ stdout: ' M build.gradle.kts\0?? dist/index.js\0', stderr: '', exitCode: 0 });
    repository = new LocalGitRepository('/workspace');
  });

  it('checks out the bump branch from the remote base branch', async () => {
    await repository.checkoutBumpBranch('develop', 'chore/bump-version-1.2.4', false);

    expect(execMock.exec).toHaveBeenCalledWith('git', [
      'fetch',
      'origin',
      '+refs/heads/develop:refs/remotes/origin/develop',
      '--depth=1',
    ], { cwd: '/workspace' });
    expect(execMock.exec).toHaveBeenCalledWith(
      'git',
      ['checkout', '-B', 'chore/bump-version-1.2.4', 'origin/develop'],
      { cwd: '/workspace' },
    );
  });

  it('unshallows the repository and fetches tags when full history is required', async () => {
    execMock.getExecOutput.mockResolvedValue({ stdout: 'true\n', stderr: '', exitCode: 0 });

    await repository.checkoutBumpBranch('develop', 'chore/bump-version-1.2.4', true);

    expect(execMock.getExecOutput).toHaveBeenCalledWith('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: '/workspace',
      ignoreReturnCode: false,
    });
    expect(execMock.exec).toHaveBeenCalledWith('git', [
      'fetch',
      'origin',
      '+refs/heads/develop:refs/remotes/origin/develop',
      '--unshallow',
      '--tags',
    ], { cwd: '/workspace' });
  });

  it('fetches tags without unshallowing a complete repository', async () => {
    execMock.getExecOutput.mockResolvedValue({ stdout: 'false\n', stderr: '', exitCode: 0 });

    await repository.checkoutBumpBranch('develop', 'chore/bump-version-1.2.4', true);

    expect(execMock.exec).toHaveBeenCalledWith('git', [
      'fetch',
      'origin',
      '+refs/heads/develop:refs/remotes/origin/develop',
      '--tags',
    ], { cwd: '/workspace' });
  });

  it('reads changed files from git status porcelain output', async () => {
    await expect(repository.getChangedFiles()).resolves.toEqual(['build.gradle.kts', 'dist/index.js']);

    expect(execMock.getExecOutput).toHaveBeenCalledWith('git', ['status', '--porcelain', '--untracked-files=all', '-z'], {
      cwd: '/workspace',
      ignoreReturnCode: false,
    });
  });
});
