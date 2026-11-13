export interface GitRepository {
  checkoutBumpBranch(baseBranch: string, branch: string, fetchFullHistory: boolean): Promise<void>;
  getChangedFiles(): Promise<string[]>;
}
