import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionConfig } from '../../../src/domain/config/action-config';
import { GradleKtsStrategy } from '../../../src/infrastructure/strategies/gradle-kts';
import { createStrategy } from '../../../src/infrastructure/strategies';
import { MavenStrategy } from '../../../src/infrastructure/strategies/maven';
import { NpmStrategy } from '../../../src/infrastructure/strategies/npm';
import { RegexStrategy } from '../../../src/infrastructure/strategies/regex';
import { RustStrategy } from '../../../src/infrastructure/strategies/rust';

const execMock = vi.hoisted(() => ({
  exec: vi.fn(),
}));

vi.mock('@actions/exec', () => execMock);

describe('version strategies', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-bump-action-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads and updates gradle-kts versions', async () => {
    const filePath = path.join(tempDir, 'build.gradle.kts');
    fs.writeFileSync(filePath, 'plugins {}\nversion = "0.1.2"\n');

    const strategy = new GradleKtsStrategy(tempDir, 'build.gradle.kts');

    expect(strategy.getPotentialChangedFiles()).toEqual([filePath]);
    expect(await strategy.readCurrentVersion()).toBe('0.1.2');
    expect(await strategy.writeNextVersion('0.1.3')).toEqual([filePath]);
    expect(fs.readFileSync(filePath, 'utf8')).toContain('version = "0.1.3"');
  });

  it('rejects ambiguous gradle-kts versions', async () => {
    fs.writeFileSync(path.join(tempDir, 'build.gradle.kts'), 'version = "0.1.2"\nversion = "0.1.3"\n');

    await expect(new GradleKtsStrategy(tempDir, 'build.gradle.kts').readCurrentVersion()).rejects.toThrow('multiple version assignments');
  });

  it('creates the maven strategy from configuration', () => {
    const config = { strategy: { value: 'maven' }, versionFile: 'pom.xml' } as ActionConfig;

    expect(createStrategy(tempDir, config)).toBeInstanceOf(MavenStrategy);
  });

  it('reads and updates only the direct Maven project version', async () => {
    const filePath = path.join(tempDir, 'pom.xml');
    const original = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <parent><version>9.9.9</version></parent>
  <version>  1.2.3  </version>
  <properties><revision>8.8.8</revision></properties>
  <dependencies><dependency><version>7.7.7</version></dependency></dependencies>
</project>
`;
    fs.writeFileSync(filePath, original);

    const strategy = new MavenStrategy(tempDir, 'pom.xml');

    expect(strategy.getPotentialChangedFiles()).toEqual([filePath]);
    expect(await strategy.readCurrentVersion()).toBe('1.2.3');
    expect(await strategy.writeNextVersion('1.2.4')).toEqual([filePath]);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(original.replace('  1.2.3  ', '  1.2.4  '));
    expect(execMock.exec).not.toHaveBeenCalled();
  });

  it('rejects missing and ambiguous Maven project versions', async () => {
    const filePath = path.join(tempDir, 'pom.xml');
    fs.writeFileSync(filePath, '<project><parent><version>1.2.3</version></parent></project>');
    const strategy = new MavenStrategy(tempDir, 'pom.xml');

    await expect(strategy.readCurrentVersion()).rejects.toThrow('direct <project><version>');

    fs.writeFileSync(filePath, '<project><version>1.2.3</version><version>1.2.4</version></project>');
    await expect(strategy.readCurrentVersion()).rejects.toThrow('multiple direct <project><version>');
  });

  it('rejects malformed or non-static Maven project versions', async () => {
    const filePath = path.join(tempDir, 'pom.xml');
    const strategy = new MavenStrategy(tempDir, 'pom.xml');

    fs.writeFileSync(filePath, '<project><version>1.2.3</project>');
    await expect(strategy.readCurrentVersion()).rejects.toThrow('as XML');

    fs.writeFileSync(filePath, '<project><version>${revision}</version></project>');
    await expect(strategy.readCurrentVersion()).rejects.toThrow('static MAJOR.MINOR.PATCH');
  });

  it('creates the rust strategy from configuration', () => {
    const config = { strategy: { value: 'rust' }, versionFile: 'Cargo.toml' } as ActionConfig;

    expect(createStrategy(tempDir, config)).toBeInstanceOf(RustStrategy);
  });

  it('reads and updates only the Rust package version', async () => {
    const filePath = path.join(tempDir, 'Cargo.toml');
    const original = `[workspace]
members = []

[package]
name = "demo"
version = '1.2.3' # keep this comment

[package.metadata.release]
version = "8.8.8"

[dependencies]
serde = { version = "9.9.9" }
`;
    fs.writeFileSync(filePath, original);

    const strategy = new RustStrategy(tempDir, 'Cargo.toml');

    expect(strategy.getPotentialChangedFiles()).toEqual([filePath, path.join(tempDir, 'Cargo.lock')]);
    expect(await strategy.readCurrentVersion()).toBe('1.2.3');
    expect(await strategy.writeNextVersion('1.2.4')).toEqual([filePath]);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(original.replace("version = '1.2.3'", "version = '1.2.4'"));
    expect(execMock.exec).not.toHaveBeenCalled();
  });

  it('rejects missing or workspace-inherited Rust package versions', async () => {
    const filePath = path.join(tempDir, 'Cargo.toml');
    const strategy = new RustStrategy(tempDir, 'Cargo.toml');

    fs.writeFileSync(filePath, '[package]\nname = "demo"\n');
    await expect(strategy.readCurrentVersion()).rejects.toThrow('Could not resolve [package].version');

    fs.writeFileSync(filePath, '[package]\nname = "demo"\nversion.workspace = true\n');
    await expect(strategy.readCurrentVersion()).rejects.toThrow('Workspace inheritance is not supported');
  });

  it('rejects malformed, ambiguous, or non-string Rust package versions', async () => {
    const filePath = path.join(tempDir, 'Cargo.toml');
    const strategy = new RustStrategy(tempDir, 'Cargo.toml');

    fs.writeFileSync(filePath, '[package\nversion = "1.2.3"\n');
    await expect(strategy.readCurrentVersion()).rejects.toThrow('as TOML');

    fs.writeFileSync(filePath, '[package]\nversion = "1.2.3"\nversion = "1.2.4"\n');
    await expect(strategy.readCurrentVersion()).rejects.toThrow('as TOML');

    fs.writeFileSync(filePath, '[package]\nversion = 1.23\n');
    await expect(strategy.readCurrentVersion()).rejects.toThrow('static MAJOR.MINOR.PATCH');
  });

  it('updates package.json directly when package-lock.json is absent', async () => {
    const filePath = path.join(tempDir, 'package.json');
    fs.writeFileSync(filePath, JSON.stringify({ name: 'demo', version: '1.2.3' }, null, 2));

    const strategy = new NpmStrategy(tempDir, 'package.json');

    expect(strategy.getPotentialChangedFiles()).toEqual([filePath, path.join(tempDir, 'package-lock.json')]);
    expect(await strategy.readCurrentVersion()).toBe('1.2.3');
    expect(await strategy.writeNextVersion('1.2.4')).toEqual([filePath]);
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toMatchObject({ version: '1.2.4' });
    expect(execMock.exec).not.toHaveBeenCalled();
  });

  it('uses npm version when package-lock.json is present', async () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.2.3' }, null, 2));
    fs.writeFileSync(path.join(tempDir, 'package-lock.json'), JSON.stringify({ name: 'demo', version: '1.2.3' }, null, 2));

    const strategy = new NpmStrategy(tempDir, 'package.json');
    const changedFiles = await strategy.writeNextVersion('1.2.4');

    expect(execMock.exec).toHaveBeenCalledWith('npm', ['version', '1.2.4', '--no-git-tag-version', '--allow-same-version'], {
      cwd: tempDir,
    });
    expect(changedFiles).toEqual([path.join(tempDir, 'package.json'), path.join(tempDir, 'package-lock.json')]);
  });

  it('reads and updates versions with regex strategy', async () => {
    const filePath = path.join(tempDir, 'VERSION.txt');
    fs.writeFileSync(filePath, 'releaseVersion=1.2.3\n');

    const strategy = new RegexStrategy(tempDir, 'VERSION.txt', 'releaseVersion=(\\d+\\.\\d+\\.\\d+)', 'releaseVersion={version}');

    expect(strategy.getPotentialChangedFiles()).toEqual([filePath]);
    expect(await strategy.readCurrentVersion()).toBe('1.2.3');
    expect(await strategy.writeNextVersion('1.2.4')).toEqual([filePath]);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('releaseVersion=1.2.4\n');
  });

  it('requires exactly one regex capture group', async () => {
    fs.writeFileSync(path.join(tempDir, 'VERSION.txt'), 'version=1.2.3\n');

    await expect(new RegexStrategy(tempDir, 'VERSION.txt', 'version=\\d+\\.\\d+\\.\\d+', 'version={version}').readCurrentVersion()).rejects.toThrow(
      'exactly one capture group',
    );
  });
});
