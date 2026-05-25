import { describe, expect, test } from '@jest/globals';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = process.cwd();
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const vscodeManifestPath = join(rootDir, 'vscode/package.json');

describe('package manifest', () => {
  test('does not ship repository automation', () => {
    expect(packageJson.scripts).not.toHaveProperty('semantic-release');
    expect(packageJson.scripts).not.toHaveProperty('prepare');
    expect(packageJson.scripts).not.toHaveProperty('prepublishOnly');
    expect(packageJson.scripts).not.toHaveProperty('test:ci');
    expect(packageJson.scripts).not.toHaveProperty('test:publish');
    expect(packageJson.devDependencies ?? {}).not.toHaveProperty('semantic-release');
    expect(packageJson.devDependencies ?? {}).not.toHaveProperty('@semantic-release/npm');
    expect(packageJson.devDependencies ?? {}).not.toHaveProperty('husky');
    expect(packageJson.devDependencies ?? {}).not.toHaveProperty('@commitlint/cli');
    expect(packageJson.devDependencies ?? {}).not.toHaveProperty('@commitlint/config-conventional');
    expect(existsSync(join(rootDir, '.releaserc.json'))).toBe(false);
    expect(existsSync(join(rootDir, '.commitlintrc.json'))).toBe(false);
    expect(existsSync(join(rootDir, '.gitmessage'))).toBe(false);
    expect(existsSync(join(rootDir, '.husky/commit-msg'))).toBe(false);
    expect(existsSync(join(rootDir, '.github/workflows/release.yml'))).toBe(false);
    expect(existsSync(join(rootDir, '.github/dependabot.yml'))).toBe(false);
  });

  test('does not ship GitHub Actions workflows', () => {
    const workflowsDir = join(rootDir, '.github/workflows');
    const workflowFiles = existsSync(workflowsDir) ? readdirSync(workflowsDir) : [];

    expect(workflowFiles).toEqual([]);
  });

  test('declares a cross-platform VS Code extension without platform locks', () => {
    expect(existsSync(vscodeManifestPath)).toBe(true);
    const vscodePackageJson = JSON.parse(readFileSync(vscodeManifestPath, 'utf8'));

    expect(vscodePackageJson.publisher).toBe('ramaaditya49');
    expect(vscodePackageJson.main).toBe('./src/extension.cjs');
    expect(packageJson.main).toBe('src/index.js');
    expect(vscodePackageJson.engines.vscode).toMatch(/^\^1\./);
    expect(vscodePackageJson.extensionKind).toEqual(['workspace', 'ui']);
    expect(vscodePackageJson.capabilities).toEqual({
      virtualWorkspaces: true,
      untrustedWorkspaces: {
        supported: true
      }
    });
    expect(vscodePackageJson.os).toBeUndefined();
    expect(vscodePackageJson.cpu).toBeUndefined();
    expect(vscodePackageJson.scripts).toHaveProperty('check');
    expect(vscodePackageJson.scripts).toHaveProperty('package');
    expect(packageJson.scripts).toHaveProperty('vscode:package');
    expect(packageJson.scripts).not.toHaveProperty('vscode:publish');
    expect(vscodePackageJson.scripts).not.toHaveProperty('publish');
  });
});
