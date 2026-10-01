export type StrategyNameValue = 'gradle-kts' | 'maven' | 'npm' | 'rust' | 'regex';

const GRADLE_KTS = 'gradle-kts';
const MAVEN = 'maven';
const NPM = 'npm';
const RUST = 'rust';
const REGEX = 'regex';
const STRATEGY_NAMES = new Set<string>([GRADLE_KTS, MAVEN, NPM, RUST, REGEX]);

export class StrategyName {
  private constructor(readonly value: StrategyNameValue) {}

  static fromInput(value: string): StrategyName {
    const normalized = value.trim().toLowerCase();
    if (STRATEGY_NAMES.has(normalized)) {
      return new StrategyName(normalized as StrategyNameValue);
    }

    throw new Error(`Invalid strategy "${value}". Expected gradle-kts, maven, npm, rust, or regex.`);
  }

  isRegex(): boolean {
    return this.value === REGEX;
  }
}
