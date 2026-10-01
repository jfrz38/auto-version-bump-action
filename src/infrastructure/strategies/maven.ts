import fs from 'node:fs/promises';
import path from 'node:path';
import { parse, type DocumentCstNode, type ElementCstNode } from '@xml-tools/parser';
import type { VersionStrategy } from '../../domain/versioning/version-strategy';

const MAVEN_PROPERTY_REFERENCE_PATTERN = /\$\{[^}]+\}/;

interface VersionLocation {
  end: number;
  start: number;
  version: string;
}

export class MavenStrategy implements VersionStrategy {
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
    const result = parse(content);
    if (result.lexErrors.length > 0 || result.parseErrors.length > 0) {
      throw new Error(`Could not parse ${this.filePath} as XML.`);
    }

    const document = result.cst as DocumentCstNode;
    const roots = document.children.element ?? [];
    if (roots.length !== 1 || localName(roots[0]) !== 'project') {
      throw new Error(`Could not resolve a Maven project from ${this.filePath}. Expected one <project> root element.`);
    }

    const directChildren = roots[0].children.content?.flatMap((node) => node.children.element ?? []) ?? [];
    const versions = directChildren.filter((element) => localName(element) === 'version');
    if (versions.length === 0) {
      throw new Error(`Could not resolve a direct <project><version> from ${this.filePath}.`);
    }
    if (versions.length > 1) {
      throw new Error(`Found multiple direct <project><version> elements in ${this.filePath}. Refusing to choose one.`);
    }

    const versionElement = versions[0];
    const contentStart = versionElement.children.START_CLOSE?.[0]?.endOffset;
    const contentEnd = versionElement.children.SLASH_OPEN?.[0]?.startOffset;
    if (contentStart === undefined || contentEnd === undefined) {
      throw new Error(`Could not safely update the Maven project version in ${this.filePath}.`);
    }

    const innerContent = content.slice(contentStart + 1, contentEnd);
    const version = innerContent.trim();
    if (!version || version.includes('<') || version.includes('>') || MAVEN_PROPERTY_REFERENCE_PATTERN.test(version)) {
      throw new Error(`Could not resolve a static Maven project version from ${this.filePath}.`);
    }

    const start = contentStart + 1 + innerContent.indexOf(version);
    return { start, end: start + version.length, version };
  }
}

function localName(element: ElementCstNode): string | undefined {
  return element.children.Name?.[0]?.image.split(':').pop();
}
