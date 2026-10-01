import type { ChangelogStrategy } from '../domain/config/changelog-strategy';
import type { ChangelogGenerator } from '../domain/ports/changelog-generator';
import type { VersionBumpPlan } from '../domain/version-bump/version-bump-plan';

export type ChangelogGeneratorFactory = (strategy: ChangelogStrategy) => ChangelogGenerator | undefined;

export class GenerateChangelog {
  constructor(private readonly createGenerator: ChangelogGeneratorFactory) {}

  async execute(strategy: ChangelogStrategy, cwd: string, plan: VersionBumpPlan): Promise<void> {
    const generator = this.createGenerator(strategy);
    if (!generator) {
      return;
    }

    await generator.generate({
      cwd,
      nextVersion: plan.nextVersionText,
      targetTag: plan.tag.name,
    });
  }
}
