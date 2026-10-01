export type ChangelogStrategyValue = 'none' | 'git-cliff';

const NONE = 'none';
const GIT_CLIFF = 'git-cliff';
const CHANGELOG_STRATEGIES = new Set<string>([NONE, GIT_CLIFF]);

export class ChangelogStrategy {
  private constructor(readonly value: ChangelogStrategyValue) {}

  static fromInput(value: string): ChangelogStrategy {
    const normalized = value.trim().toLowerCase() || NONE;
    if (CHANGELOG_STRATEGIES.has(normalized)) {
      return new ChangelogStrategy(normalized as ChangelogStrategyValue);
    }

    throw new Error(`Invalid changelog strategy "${value}". Expected none or git-cliff.`);
  }

  isEnabled(): boolean {
    return this.value !== NONE;
  }
}
