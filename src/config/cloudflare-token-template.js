export const REQUIRED_TOKEN_PERMISSIONS = Object.freeze([
  Object.freeze({
    key: 'page',
    type: 'edit',
    label: 'Account > Pages > Write'
  }),
  Object.freeze({
    key: 'workers_scripts',
    type: 'edit',
    label: 'Account > Workers Scripts > Write'
  })
]);

export function buildCloudflareApiTokenTemplateUrl({
  permissions = REQUIRED_TOKEN_PERMISSIONS,
  tokenName = 'Cloudflare Bulk Delete',
  accountId = '*',
  zoneId = 'all'
} = {}) {
  const permissionGroupKeys = permissions.map(({ key, type }) => ({ key, type }));
  const params = new URLSearchParams({
    permissionGroupKeys: JSON.stringify(permissionGroupKeys),
    accountId,
    zoneId,
    name: tokenName
  });

  return `https://dash.cloudflare.com/profile/api-tokens?${params.toString()}`;
}

export const CLOUDFLARE_API_TOKEN_TEMPLATE_URL = buildCloudflareApiTokenTemplateUrl();
