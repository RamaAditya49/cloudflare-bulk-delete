import { describe, test, expect } from '@jest/globals';
import {
  buildCloudflareApiTokenTemplateUrl,
  CLOUDFLARE_API_TOKEN_TEMPLATE_URL,
  REQUIRED_TOKEN_PERMISSIONS
} from '../../src/config/cloudflare-token-template.js';

describe('Cloudflare API token template', () => {
  test('should include all permissions required for bulk delete operations', () => {
    expect(REQUIRED_TOKEN_PERMISSIONS).toEqual([
      {
        key: 'page',
        type: 'edit',
        label: 'Account > Pages > Write'
      },
      {
        key: 'workers_scripts',
        type: 'edit',
        label: 'Account > Workers Scripts > Write'
      }
    ]);
  });

  test('should build a Cloudflare dashboard token template URL', () => {
    const url = new URL(CLOUDFLARE_API_TOKEN_TEMPLATE_URL);

    expect(url.origin).toBe('https://dash.cloudflare.com');
    expect(url.pathname).toBe('/profile/api-tokens');
    expect(url.searchParams.get('accountId')).toBe('*');
    expect(url.searchParams.get('zoneId')).toBe('all');
    expect(url.searchParams.get('name')).toBe('Cloudflare Bulk Delete');
    expect(JSON.parse(url.searchParams.get('permissionGroupKeys'))).toEqual([
      { key: 'page', type: 'edit' },
      { key: 'workers_scripts', type: 'edit' }
    ]);
  });

  test('should allow overriding template inputs', () => {
    const url = new URL(
      buildCloudflareApiTokenTemplateUrl({
        tokenName: 'Custom Token',
        accountId: 'account-id',
        zoneId: 'zone-id',
        permissions: [{ key: 'page', type: 'read' }]
      })
    );

    expect(url.searchParams.get('accountId')).toBe('account-id');
    expect(url.searchParams.get('zoneId')).toBe('zone-id');
    expect(url.searchParams.get('name')).toBe('Custom Token');
    expect(JSON.parse(url.searchParams.get('permissionGroupKeys'))).toEqual([
      { key: 'page', type: 'read' }
    ]);
  });
});
