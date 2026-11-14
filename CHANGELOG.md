# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- git-cliff: end of header -->
## [Unreleased]


### Added
- Add optional git-cliff changelog generation
- Resolve latest git-cliff release
- Add maven version strategy
- Add rust version strategy
- Add python version strategy
- Support Linux runners only


### Changed
- Merge remote-tracking branch 'origin/develop' into feature/iss-35
- Centralize version validation in domain
- Bump version to 0.4.0

## [0.3.0] - 2026-08-23


### Added
- Add clean architecture eslint plugin (#24)


### Changed
- [iss-20] document pre-commit-commands usage
- [iss-19] add verified commits
- [iss-19] refactor to modularized architecture
- [iss-19] add missing tests
- [iss-19] fix unknown types
- [iss-19] move ports to domain
- [iss-19] add fixed index
- [iss-19] fix readme example
- [iss-19] improve architecture for npm version strategy
- [iss-19] fix readme example
- Change Python version to 3.13 and adjust Poetry setup

Updated Python version to 3.13 and modified Poetry installation steps.
- Bump version to 0.3.0

## [0.2.1] - 2026-06-05


### Added
- Add cooldown for dependency updates

Added cooldown setting for npm and GitHub Actions dependencies.
- Add optional pre commit commands
- Improve git status logic


### Fixed
- Fix badge


### Changed
- Improve action and readme
- Upgrade versions
- Upgrade node version


### Removed
- Remove on push trigger

## [0.2.0] - 2026-04-26


### Added
- Add badges to README for CI and project info

Added badges for CI, GitHub release, Marketplace, and License.
- Add protection for existing branch
- Add input to allow force push on existing branch
- Add domain Tag
- Add bump version action


### Changed
- Enhance README with quick start and usage details

Added quick start guide and usage examples for npm and Gradle Kotlin DSL.
- Improve organization avoiding import infrastructure from application layer
- Create commit and PR domain objects
- Create template service
- Set use case as class
- Use DI for use case and renders
- Improve test structure
- Move template render to service
- Improve branch class
- Bump version to 0.2.0

## [0.1.1] - 2026-04-25


### Changed
- Bump version from 0.1.0 to 0.1.1

## [0.1.0] - 2026-04-25


### Added
- Add unit tests
- Add readme
- Add compiled code
- Add GHA workflows
- Add codeowners
- Add pnpm


### Changed
- Initial commit
- Init setup with general configuration
- Create domain model
- Implement version bump pull request flow
- Ad makefile
- Create makefile
- Rename action to 'auto-version-bump-action'
