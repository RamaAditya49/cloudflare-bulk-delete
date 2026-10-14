/**
 * Cloudflare rejects deletes that would remove a live Pages or Workers target.
 * Those responses are protection, not cleanup failures.
 */
export function isUndeletableDeploymentError(error) {
  const apiMessages = Array.isArray(error?.response?.errors)
    ? error.response.errors.map(item => item?.message)
    : [];
  const text = [error?.message, ...apiMessages].filter(Boolean).join(' ').toLowerCase();

  return (
    text.includes('active production deployment') ||
    text.includes('latest deployment') ||
    text.includes('cannot be deleted') ||
    text.includes('aliased deployment')
  );
}
