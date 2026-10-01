export interface ChangelogGenerationRequest {
  cwd: string;
  nextVersion: string;
  targetTag: string;
}

export interface ChangelogGenerator {
  generate(request: ChangelogGenerationRequest): Promise<void>;
}
