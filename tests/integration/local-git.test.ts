import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalGitRepository } from '../../src/infrastructure/git/local-git';

describe('LocalGitRepository integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-git-integration-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('fetches an absent base ref with full history and tags before checking out the bump branch', async () => {
    const remote = path.join(tempDir, 'remote.git');
    const source = path.join(tempDir, 'source');
    const checkout = path.join(tempDir, 'checkout');
    fs.mkdirSync(source);

    git(tempDir, 'init', '--bare', remote);
    git(source, 'init', '-b', 'main');
    git(source, 'config', 'user.name', 'Test User');
    git(source, 'config', 'user.email', 'test@example.com');
    fs.writeFileSync(path.join(source, 'README.md'), 'main\n');
    git(source, 'add', 'README.md');
    git(source, 'commit', '-m', 'chore: initialize main');
    git(source, 'remote', 'add', 'origin', remote);
    git(source, 'push', '-u', 'origin', 'main');
    git(source, 'tag', 'v1.0.0');
    git(source, 'push', 'origin', 'v1.0.0');
    git(source, 'switch', '-c', 'develop');
    fs.writeFileSync(path.join(source, 'README.md'), 'develop\n');
    git(source, 'commit', '-am', 'feat: advance develop');
    const developSha = git(source, 'rev-parse', 'HEAD');
    git(source, 'push', 'origin', 'develop');

    git(tempDir, 'clone', '--depth=1', '--single-branch', '--branch', 'main', pathToFileURL(remote).href, checkout);
    expect(spawnSync('git', ['rev-parse', '--verify', 'refs/remotes/origin/develop'], { cwd: checkout }).status).not.toBe(0);
    expect(git(checkout, 'rev-parse', '--is-shallow-repository')).toBe('true');

    await new LocalGitRepository(checkout).checkoutBumpBranch('develop', 'chore/bump-version-1.2.4', true);

    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(developSha);
    expect(git(checkout, 'rev-parse', 'refs/remotes/origin/develop')).toBe(developSha);
    expect(git(checkout, 'rev-parse', '--is-shallow-repository')).toBe('false');
    expect(git(checkout, 'rev-parse', 'v1.0.0')).not.toBe('');
  }, 15_000);
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
