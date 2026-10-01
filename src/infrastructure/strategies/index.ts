import type { ActionConfig } from '../../domain/config/action-config';
import type { VersionStrategy } from '../../domain/versioning/version-strategy';
import { GradleKtsStrategy } from './gradle-kts';
import { MavenStrategy } from './maven';
import { NpmStrategy } from './npm';
import { PythonStrategy } from './python';
import { RegexStrategy } from './regex';
import { RustStrategy } from './rust';

export function createStrategy(cwd: string, config: ActionConfig): VersionStrategy {
  if (config.strategy.value === 'gradle-kts') {
    return new GradleKtsStrategy(cwd, config.versionFile);
  }
  if (config.strategy.value === 'maven') {
    return new MavenStrategy(cwd, config.versionFile);
  }
  if (config.strategy.value === 'npm') {
    return new NpmStrategy(cwd, config.versionFile);
  }
  if (config.strategy.value === 'python') {
    return new PythonStrategy(cwd, config.versionFile);
  }
  if (config.strategy.value === 'rust') {
    return new RustStrategy(cwd, config.versionFile);
  }

  return new RegexStrategy(cwd, config.versionFile, config.versionPattern, config.versionReplacement);
}
