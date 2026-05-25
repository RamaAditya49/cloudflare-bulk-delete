import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const requiredCommands = [
  'cloudflareBulkDelete.configure',
  'cloudflareBulkDelete.listResources',
  'cloudflareBulkDelete.previewPagesCleanup',
  'cloudflareBulkDelete.deletePagesDeployments'
];

if (manifest.publisher !== 'ramaaditya49') {
  throw new Error('VS Code Marketplace publisher must be set explicitly.');
}

if (manifest.os || manifest.cpu) {
  throw new Error('VS Code extension must not be locked to a specific OS or CPU.');
}

if (manifest.scripts?.publish || manifest.scripts?.['vscode:publish']) {
  throw new Error('Marketplace publishing must stay manual, not scripted.');
}

for (const command of requiredCommands) {
  if (!manifest.activationEvents.includes(`onCommand:${command}`)) {
    throw new Error(`Missing activation event for ${command}.`);
  }
}

console.log('VS Code manifest check passed');
