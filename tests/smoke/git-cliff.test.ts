import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitCliffChangelogGenerator } from '../../src/infrastructure/changelog/git-cliff-changelog-generator';
import { GitCliffInstaller } from '../../src/infrastructure/changelog/git-cliff-installer';

describe('git-cliff smoke', () => {
  let tempDir: string;
  let previousRunnerTemp: string | undefined;
  let previousToolCache: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-cliff-smoke-'));
    previousRunnerTemp = process.env.RUNNER_TEMP;
    previousToolCache = process.env.RUNNER_TOOL_CACHE;
    process.env.RUNNER_TEMP ||= path.join(tempDir, 'runner-temp');
    process.env.RUNNER_TOOL_CACHE ||= path.join(tempDir, 'tool-cache');
    fs.mkdirSync(process.env.RUNNER_TEMP, { recursive: true });
    fs.mkdirSync(process.env.RUNNER_TOOL_CACHE, { recursive: true });

    git('init', '-b', 'main');
    git('config', 'user.name', 'Test User');
    git('config', 'user.email', 'test@example.com');
    commit('README.md', 'initial\n', 'feat: initial release');
    git('tag', 'v1.0.0');
    git('switch', '-c', 'unrelated-release');
    commit('OTHER.md', 'unrelated\n', 'feat: unrelated release');
    git('tag', 'v9.0.0');
    git('switch', 'main');
    commit('README.md', 'api\n', 'feat: add API');
    commit('README.md', 'fixed\n', 'fix: correct API response');
  }, 120_000);

  afterEach(() => {
    restoreEnvironment('RUNNER_TEMP', previousRunnerTemp);
    restoreEnvironment('RUNNER_TOOL_CACHE', previousToolCache);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }, 120_000);

  it('creates and prepends releases with default and repository configuration', async () => {
    const generator = new GitCliffChangelogGenerator(new GitCliffInstaller());
    await generator.generate({
      cwd: tempDir,
      nextVersion: '1.1.0',
      targetTag: 'v1.1.0',
    });

    const changelog = fs.readFileSync(path.join(tempDir, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toContain('1.1.0');
    expect(changelog).toContain('Add API');
    expect(changelog).toContain('Correct API response');
    expect(changelog).not.toContain('Initial release');
    expect(changelog).not.toContain('Unrelated release');

    git('tag', 'v1.1.0');
    commit('README.md', 'custom\n', 'feat: use repository configuration');
    fs.writeFileSync(path.join(tempDir, 'cliff.toml'), `
[changelog]
body = """
CUSTOM {{ version }}
{% for commit in commits %}- {{ commit.message }}
{% endfor %}
"""
trim = true

[git]
conventional_commits = true
filter_unconventional = false
commit_parsers = [{ message = ".*", group = "Changes" }]
`);

    await generator.generate({
      cwd: tempDir,
      nextVersion: '1.2.0',
      targetTag: 'v1.2.0',
    });

    const updatedChangelog = fs.readFileSync(path.join(tempDir, 'CHANGELOG.md'), 'utf8');
    expect(updatedChangelog).toContain('CUSTOM v1.2.0');
    expect(updatedChangelog).toContain('use repository configuration');
    expect(updatedChangelog).toContain(changelog);
    expect(updatedChangelog.indexOf('CUSTOM v1.2.0')).toBeLessThan(updatedChangelog.indexOf('1.1.0'));
  }, 120_000);

  function commit(file: string, content: string, message: string): void {
    fs.appendFileSync(path.join(tempDir, file), content);
    git('add', file);
    git('commit', '-m', message);
  }

  function git(...args: string[]): void {
    execFileSync('git', args, { cwd: tempDir, stdio: 'ignore' });
  }
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
