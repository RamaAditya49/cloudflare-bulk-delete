import { describe, expect, test } from '@jest/globals';
import { planPagesDeletion } from '../../vscode/src/cloudflare.js';

describe('VS Code Cloudflare cleanup planner', () => {
  test('keeps newest deployments and production deployments protected by default', () => {
    const deployments = [
      { id: 'old-preview', environment: 'preview', created_on: '2026-01-01T00:00:00Z' },
      { id: 'latest-preview', environment: 'preview', created_on: '2026-01-03T00:00:00Z' },
      { id: 'old-production', environment: 'production', created_on: '2026-01-02T00:00:00Z' }
    ];

    const plan = planPagesDeletion(deployments, {
      keepLatest: 1,
      skipProduction: true
    });

    expect(plan.toDelete.map(deployment => deployment.id)).toEqual(['old-preview']);
    expect(plan.skipped.map(deployment => deployment.reason)).toEqual([
      'latest-protected',
      'production-protected'
    ]);
  });

  test('filters by max age before applying safety protection', () => {
    const deployments = [
      { id: 'new-preview', environment: 'preview', created_on: '2026-05-20T00:00:00Z' },
      { id: 'old-preview', environment: 'preview', created_on: '2026-04-01T00:00:00Z' },
      { id: 'older-preview', environment: 'preview', created_on: '2026-03-01T00:00:00Z' }
    ];

    const plan = planPagesDeletion(deployments, {
      keepLatest: 1,
      maxAgeDays: 30,
      now: new Date('2026-05-25T00:00:00Z')
    });

    expect(plan.toDelete.map(deployment => deployment.id)).toEqual(['older-preview']);
    expect(plan.skipped.map(deployment => deployment.reason)).toEqual([
      'too-new',
      'latest-protected'
    ]);
  });
});
