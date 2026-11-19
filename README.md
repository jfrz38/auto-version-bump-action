# Auto Version Bump Action

[![CI](https://img.shields.io/github/actions/workflow/status/jfrz38/auto-version-bump-action/ci.yml?label=CI)](https://github.com/jfrz38/auto-version-bump-action/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/jfrz38/auto-version-bump-action?display_name=tag)](https://github.com/jfrz38/auto-version-bump-action/releases)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-auto--version--bump--action-blue?logo=githubactions)](https://github.com/marketplace/actions/auto-version-bump-action)
[![License](https://img.shields.io/github/license/jfrz38/auto-version-bump-action)](LICENSE)

**Bump versions, update changelogs, and open a review-ready pull request—without publishing a release.**

Auto Version Bump Action prepares SemVer releases behind an explicit review boundary. It updates the project version, optionally generates `CHANGELOG.md`, commits every resulting file to a dedicated branch through the GitHub API, and opens a draft pull request.

Use it when you want maintainers to review and merge release changes before a separate workflow creates tags, GitHub Releases, packages, or other artifacts.

## Why use it?

- **Multiple ecosystems:** npm, Gradle Kotlin DSL, Maven, Python, Rust, and custom text files.
- **Review-first releases:** creates a bump branch and a draft pull request instead of publishing immediately.
- **Changelog automation:** can install and run `git-cliff`, with SHA-256 verification of the downloaded archive.
- **Project-specific validation:** runs optional commands after the version change and includes their modified files in the same commit.
- **Safe repeat runs:** reuses an existing open pull request and does not overwrite an orphaned bump branch by default.
- **Release guards:** can fail when the target tag or GitHub Release already exists.

## Requirements

- A Linux GitHub Actions runner. Windows and macOS runners fail before inputs are processed or repository state changes.
- A version in simple SemVer format: `MAJOR.MINOR.PATCH`.
- `contents: write` and `pull-requests: write` workflow permissions.
- When using the default `GITHUB_TOKEN`, **Settings > Actions > General > Allow GitHub Actions to create and approve pull requests** enabled in the repository.
- `actions/checkout` before this action.

## Quick start

Create a workflow such as `.github/workflows/bump-version.yml`:

```yaml
name: Bump Version

on:
  workflow_dispatch:
    inputs:
      bump:
        description: Version component to bump
        required: true
        default: patch
        type: choice
        options:
          - patch
          - minor
          - major

permissions:
  contents: write
  pull-requests: write

jobs:
  bump:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - uses: jfrz38/auto-version-bump-action@v0
        with:
          bump: ${{ inputs.bump }}
          strategy: npm
          version-file: package.json
          changelog: git-cliff
```

If `package.json` contains version `1.2.3` and you select `patch`, the action:

1. updates the version to `1.2.4`;
2. creates or updates `CHANGELOG.md` with `git-cliff`;
3. creates `chore/bump-version-1.2.4`;
4. commits the changed files through the GitHub Git Data API; and
5. opens a draft pull request targeting the checked-out branch.

The action returns the previous and next versions, target tag, branch, pull request URL, and changed file list as [outputs](#outputs).

## Release workflow

This action intentionally stops at the pull request:

```text
Run bump workflow → Review bump PR → Merge → Publish from a separate workflow
```

It does **not** create a git tag, create a GitHub Release, publish packages or artifacts, or merge the pull request. Keeping those operations in a separate workflow makes the release boundary explicit.

## Supported version strategies

| Strategy | Version source | Behavior and limits |
| --- | --- | --- |
| `npm` | `package.json` | Updates the `version` field. If a same-directory `package-lock.json` exists, runs `npm version` to keep it synchronized. |
| `gradle-kts` | Kotlin DSL build file | Updates exactly one string assignment such as `version = "1.2.3"`. |
| `maven` | `pom.xml` | Updates exactly one direct `<version>` child of `<project>`. Inherited and property-based versions are not resolved. |
| `python` | `pyproject.toml` | Updates one static `[project].version` or `[tool.poetry].version`. Dynamic versions are not supported. |
| `rust` | `Cargo.toml` | Updates one static `[package].version`. Workspace-inherited versions are not supported. |
| `regex` | Any text file | Replaces exactly one match using a pattern with exactly one capture group. |

All strategies validate the current value as simple SemVer before calculating a `patch`, `minor`, or `major` bump.

### npm

```yaml
- uses: jfrz38/auto-version-bump-action@v0
  with:
    bump: patch
    strategy: npm
    version-file: package.json
```

Without `package-lock.json`, the action writes the next version directly to `package.json`. When a same-directory lockfile exists, it runs:

```bash
npm version <next-version> --no-git-tag-version --allow-same-version
```

### Gradle Kotlin DSL

The `gradle-kts` strategy updates exactly one assignment:

```kotlin
version = "1.2.3"
```

```yaml
- uses: jfrz38/auto-version-bump-action@v0
  with:
    bump: minor
    strategy: gradle-kts
    version-file: app/build.gradle.kts
```

### Maven

The `maven` strategy updates the direct project version while preserving the rest of the file:

```xml
<project>
  <version>1.2.3</version>
</project>
```

```yaml
- uses: jfrz38/auto-version-bump-action@v0
  with:
    bump: patch
    strategy: maven
    version-file: pom.xml
```

Parent, dependency, plugin, and profile versions are ignored. A property-based project version such as `${revision}` is not supported and causes the action to fail. The action does not run Maven or resolve inherited versions.

### Python

The `python` strategy supports the standard project metadata and Poetry:

```toml
[project]
name = "demo"
version = "1.2.3"
```

```yaml
- uses: jfrz38/auto-version-bump-action@v0
  with:
    bump: patch
    strategy: python
    version-file: pyproject.toml
```

The action does not update `poetry.lock` or run a build backend. Use [`pre-commit-commands`](#run-project-specific-commands) when those steps are needed. Use `regex` for dynamic versions or custom version files.

### Rust

The `rust` strategy updates a static package version:

```toml
[package]
name = "demo"
version = "1.2.3"
```

```yaml
- uses: jfrz38/auto-version-bump-action@v0
  with:
    bump: patch
    strategy: rust
    version-file: Cargo.toml
    pre-commit-commands: cargo check
```

The action tracks `Cargo.lock` as a potential changed file but does not modify it directly. Run an appropriate Cargo command when the repository commits its lockfile.

### Custom files with regex

Use `regex` when no built-in strategy matches the version source. For this file:

```text
releaseVersion=1.2.3
```

configure:

```yaml
- uses: jfrz38/auto-version-bump-action@v0
  with:
    bump: minor
    strategy: regex
    version-file: VERSION.txt
    version-pattern: 'releaseVersion=(\d+\.\d+\.\d+)'
    version-replacement: 'releaseVersion={version}'
```

`version-pattern` must contain exactly one capture group with the current version. `version-replacement` replaces the complete match and must place `{version}` where the next version belongs.

## Generate a changelog

Set `changelog: git-cliff` to create or update `CHANGELOG.md`:

```yaml
- uses: jfrz38/auto-version-bump-action@v0
  with:
    bump: minor
    strategy: npm
    version-file: package.json
    changelog: git-cliff
```

The action:

- resolves the latest stable `git-cliff` release at runtime;
- downloads the Linux x64 or arm64 archive for glibc or musl;
- verifies the SHA-256 digest published with the GitHub release asset;
- caches the verified archive by version and verifies it again before extraction;
- generates commits after the latest tag reachable from the selected base branch; and
- creates `CHANGELOG.md` or prepends the new release to the existing file.

When the repository root contains `cliff.toml`, the action passes it explicitly to `git-cliff`. Otherwise, it uses the binary's built-in defaults, which are oriented toward Conventional Commits. Global and parent-directory configuration is not inherited.

The selected base branch history and tags are fetched when needed. A checkout with `fetch-depth: 0` avoids that additional fetch. Self-hosted runners must allow downloads from GitHub Releases.

With the default `changelog: none`, no changelog tool is downloaded or executed.

## Run project-specific commands

Use `pre-commit-commands` to regenerate lockfiles, build distributable files, or validate the changed version before the pull request is created:

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0

- uses: actions/setup-node@v7
  with:
    node-version: 22
    cache: pnpm

- run: corepack enable
- run: pnpm install --frozen-lockfile

- uses: jfrz38/auto-version-bump-action@v0
  with:
    bump: minor
    strategy: npm
    version-file: packages/cli/package.json
    pre-commit-commands: |
      pnpm test
      make package-github-action
```

Commands run one per line in the checked-out workspace after the version file is updated. The action uses tools already available in the job; it does not install project-specific runtimes or package managers.

If a command exits with a non-zero status, the action stops before creating the branch commit or pull request. Files created, modified, or deleted by successful commands are included in the same commit.

## Safe repeat runs

The default branch name is `chore/bump-version-{next-version}`.

- If an open pull request already exists for the same head and base branches, the action returns that pull request instead of creating a duplicate.
- If the remote branch exists without an open pull request, the action fails rather than overwrite remote work.
- Set `overwrite-existing-branch: true` only when that generated branch should be replaced through the GitHub API.
- The action fails by default when `${tag-prefix}${next-version}` already exists as a tag or GitHub Release. Disable either check independently when needed.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `bump` | Yes | — | Version component: `patch`, `minor`, or `major`. |
| `strategy` | Yes | — | Version strategy: `gradle-kts`, `maven`, `npm`, `python`, `rust`, or `regex`. |
| `version-file` | Yes | — | Path to the file containing the version. |
| `version-pattern` | For `regex` | — | Regex with exactly one capture group containing the current version. |
| `version-replacement` | For `regex` | — | Replacement for the complete match. Use `{version}` for the next version. |
| `changelog` | No | `none` | Changelog strategy: `none` or `git-cliff`. |
| `base-branch` | No | Current or default branch | Base branch for the pull request. |
| `branch-prefix` | No | `chore/bump-version-` | Prefix for the generated branch. |
| `tag-prefix` | No | `v` | Prefix used for tag and release existence checks. |
| `draft` | No | `true` | Create the pull request as a draft. |
| `github-token` | No | `${{ github.token }}` | Token for checks, GitHub API commits, branch updates, and pull requests. |
| `overwrite-existing-branch` | No | `false` | Replace an existing bump branch when no open pull request is found. |
| `commit-message` | No | `Bump version to {version}` | Commit message template. |
| `pre-commit-commands` | No | — | Commands to run after the bump and before the commit, one per line. |
| `pr-title` | No | `Bump version to {version}` | Pull request title template. |
| `pr-body` | No | `Bumps version from {current-version} to {next-version} using a {bump} release bump.` | Pull request body template. |
| `fail-if-tag-exists` | No | `true` | Fail when the target tag already exists. |
| `fail-if-release-exists` | No | `true` | Fail when a GitHub Release already exists for the target tag. |

The `commit-message`, `pr-title`, and `pr-body` templates support:

- `{version}` and `{next-version}` for the calculated version;
- `{current-version}` for the version before the bump; and
- `{bump}` for `patch`, `minor`, or `major`.

## Outputs

Assign an `id` to the action step to use its outputs:

```yaml
- id: bump
  uses: jfrz38/auto-version-bump-action@v0
  with:
    bump: patch
    strategy: npm
    version-file: package.json

- run: echo "Review ${{ steps.bump.outputs.pr-url }}"
```

| Output | Description |
| --- | --- |
| `current-version` | Version read before applying the bump. |
| `next-version` | Version written by the action. |
| `tag` | Tag name associated with the next version. |
| `branch` | Branch created or reused by the action. |
| `pr-url` | URL of the created or reused pull request. |
| `changed-files` | Newline-separated list of files changed by the bump. Empty when an existing pull request is reused. |

## Permissions and commit identity

The calling workflow needs:

```yaml
permissions:
  contents: write
  pull-requests: write
```

The action creates the bump commit through the GitHub Git Data API using `github-token`. With the default `GITHUB_TOKEN`, GitHub attributes the commit to `github-actions[bot]`; it can appear as a verified GitHub Actions bot commit without configuring GPG or SSH signing keys.

Check out the branch that the pull request should target, or pass `base-branch` explicitly. Use `fetch-depth: 0` when generating a changelog or when full history is otherwise required by your project commands.

## Limitations

- Only Linux runners are supported.
- Versions must use exactly `MAJOR.MINOR.PATCH`; prerelease and build metadata are not supported.
- Each built-in strategy updates one specific version source rather than resolving every ecosystem-specific version mechanism.
- `git-cliff` is resolved at runtime, so a newly published version can change generated output between action runs.
- The action prepares a release pull request; publishing remains the responsibility of a separate workflow.

## Support and contributing

Use [GitHub Issues](https://github.com/jfrz38/auto-version-bump-action/issues) to report a bug or propose an enhancement. Pull requests are welcome; run `make check` before submitting changes.

See [CHANGELOG.md](CHANGELOG.md) for notable project changes.

## License

This project is available under the [MIT License](LICENSE).
