import type { ChangelogStrategy } from '../../domain/config/changelog-strategy';
import type { ChangelogGenerator } from '../../domain/ports/changelog-generator';
import { GitCliffChangelogGenerator } from './git-cliff-changelog-generator';
import { GitCliffInstaller } from './git-cliff-installer';

export function createChangelogGenerator(strategy: ChangelogStrategy): ChangelogGenerator | undefined {
  if (strategy.value === 'none') {
    return undefined;
  }

  return new GitCliffChangelogGenerator(new GitCliffInstaller());
}
