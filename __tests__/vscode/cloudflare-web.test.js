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

  test('keeps the latest deployment of each branch even when global keepLatest is zero', () => {
    const deployments = [
      {
        id: 'feature-old',
        environment: 'preview',
        created_on: '2026-01-01T00:00:00Z',
        deployment_trigger: { metadata: { branch: 'feature' } }
      },
      {
        id: 'feature-latest',
        environment: 'preview',
        created_on: '2026-01-03T00:00:00Z',
        deployment_trigger: { metadata: { branch: 'feature' } }
      },
      {
        id: 'main-old',
        environment: 'preview',
        created_on: '2026-01-02T00:00:00Z',
        deployment_trigger: { metadata: { branch: 'main' } }
      }
    ];

    const plan = planPagesDeletion(deployments, {
      keepLatest: 0,
      skipProduction: false
    });

    expect(plan.toDelete.map(deployment => deployment.id)).toEqual(['feature-old']);
    expect(plan.skipped.map(deployment => deployment.id)).toEqual(['feature-latest', 'main-old']);
    expect(plan.skipped.map(deployment => deployment.reason)).toEqual([
      'branch-latest-protected',
      'branch-latest-protected'
    ]);
  });
});
