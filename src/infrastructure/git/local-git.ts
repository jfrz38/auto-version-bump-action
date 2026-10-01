import * as exec from '@actions/exec';
import type { GitRepository } from '../../domain/ports/git-repository';
import { GitStatus } from './git-status';

const GIT_COMMAND = 'git';

export class LocalGitRepository implements GitRepository {
  constructor(private readonly cwd = process.cwd()) {}

  async checkoutBumpBranch(baseBranch: string, branch: string, fetchFullHistory: boolean): Promise<void> {
    const baseRefspec = `+refs/heads/${baseBranch}:refs/remotes/origin/${baseBranch}`;
    if (fetchFullHistory) {
      const isShallow = (await gitOutput(['rev-parse', '--is-shallow-repository'], this.cwd)).trim() === 'true';
      await git(['fetch', 'origin', baseRefspec, ...(isShallow ? ['--unshallow'] : []), '--tags'], this.cwd);
    } else {
      await git(['fetch', 'origin', baseRefspec, '--depth=1'], this.cwd);
    }
    await git(['checkout', '-B', branch, `origin/${baseBranch}`], this.cwd);
  }

  async getChangedFiles(): Promise<string[]> {
    const status = await gitOutput(['status', '--porcelain', '--untracked-files=all', '-z'], this.cwd);
    return GitStatus.fromPorcelain(status).changedFiles;
  }
}

async function git(args: string[], cwd: string): Promise<void> {
  await exec.exec(GIT_COMMAND, args, { cwd });
}

async function gitOutput(args: string[], cwd: string): Promise<string> {
  const result = await exec.getExecOutput(GIT_COMMAND, args, { cwd, ignoreReturnCode: false });
  return result.stdout;
}
