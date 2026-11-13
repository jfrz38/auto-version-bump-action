import fs from 'node:fs/promises';
import path from 'node:path';
import { parseTOML, type AST } from 'toml-eslint-parser';
import type { VersionStrategy } from '../../domain/versioning/version-strategy';

interface TomlEntry {
  node: AST.TOMLKeyValue;
  path: (string | number)[];
}

interface VersionLocation {
  end: number;
  start: number;
  version: string;
}

export class PythonStrategy implements VersionStrategy {
  private readonly filePath: string;

  constructor(cwd: string, versionFile: string) {
    this.filePath = path.resolve(cwd, versionFile);
  }

  getPotentialChangedFiles(): string[] {
    return [this.filePath];
  }

  async readCurrentVersion(): Promise<string> {
    const content = await fs.readFile(this.filePath, 'utf8');
    return this.locateVersion(content).version;
  }

  async writeNextVersion(nextVersion: string): Promise<string[]> {
    const original = await fs.readFile(this.filePath, 'utf8');
    const location = this.locateVersion(original);
    const updated = `${original.slice(0, location.start)}${nextVersion}${original.slice(location.end)}`;

    await fs.writeFile(this.filePath, updated, 'utf8');
    return [this.filePath];
  }

  private locateVersion(content: string): VersionLocation {
    let document: AST.TOMLProgram;
    try {
      document = parseTOML(content, { tomlVersion: '1.0' });
    } catch (error) {
      throw new Error(`Could not parse ${this.filePath} as TOML: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }

    const entries: TomlEntry[] = document.body[0].body.flatMap((node) => {
      if (node.type === 'TOMLKeyValue') {
        return [{ path: keyParts(node.key), node }];
      }

      return node.body.map((entry) => ({ path: [...node.resolvedKey, ...keyParts(entry.key)], node: entry }));
    });
    const projectVersions = entries.filter((entry) => pathsEqual(entry.path, ['project', 'version']));
    const poetryVersions = entries.filter((entry) => pathsEqual(entry.path, ['tool', 'poetry', 'version']));
    const dynamicVersions = entries
      .filter((entry) => pathsEqual(entry.path, ['project', 'dynamic']))
      .some((entry) => isDynamicVersion(entry.node.value));

    if (dynamicVersions) {
      throw new Error(`Could not resolve a static Python version from ${this.filePath}. Dynamic version metadata is not supported.`);
    }

    const versions = [...projectVersions, ...poetryVersions];
    if (versions.length === 0) {
      throw new Error(`Could not resolve [project].version or [tool.poetry].version from ${this.filePath}.`);
    }
    if (versions.length > 1) {
      throw new Error(`Found multiple Python version values in ${this.filePath}. Refusing to choose one.`);
    }

    const value = versions[0].node.value;
    if (value.type !== 'TOMLValue' || value.kind !== 'string' || value.multiline) {
      throw new Error(`Could not resolve a static string Python version from ${this.filePath}.`);
    }

    const source = content.slice(value.range[0], value.range[1]);
    const quote = source[0];
    if ((quote !== '"' && quote !== "'") || source.at(-1) !== quote || source.slice(1, -1) !== value.value) {
      throw new Error(`Could not safely update the Python version in ${this.filePath}.`);
    }

    return { start: value.range[0] + 1, end: value.range[1] - 1, version: value.value };
  }
}

function isDynamicVersion(value: AST.TOMLValue | AST.TOMLArray | AST.TOMLInlineTable): boolean {
  return (
    value.type === 'TOMLArray' &&
    value.elements.some((element) => element.type === 'TOMLValue' && element.kind === 'string' && element.value === 'version')
  );
}

function keyParts(key: AST.TOMLKey): string[] {
  return key.keys.map((part) => (part.type === 'TOMLBare' ? part.name : part.value));
}

function pathsEqual(left: (string | number)[], right: string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}
