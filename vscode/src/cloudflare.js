const DEFAULT_BASE_URL = 'https://api.cloudflare.com/client/v4';
const PAGE_SIZE = 100;

export function planPagesDeletion(deployments, options = {}) {
  const { keepLatest = 1, skipProduction = true, maxAgeDays, now = new Date() } = options;

  const cutoff =
    Number.isFinite(maxAgeDays) && maxAgeDays >= 0
      ? new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000)
      : null;

  const sortedDeployments = [...deployments].sort(
    (a, b) => new Date(b.created_on) - new Date(a.created_on)
  );

  const skipped = [];
  const ageEligible = [];

  for (const deployment of sortedDeployments) {
    if (cutoff && new Date(deployment.created_on) > cutoff) {
      skipped.push({ ...deployment, reason: 'too-new' });
      continue;
    }

    ageEligible.push(deployment);
  }

  const toDelete = [];

  ageEligible.forEach((deployment, index) => {
    if (keepLatest > 0 && index < keepLatest) {
      skipped.push({ ...deployment, reason: 'latest-protected' });
      return;
    }

    if (skipProduction && deployment.environment === 'production') {
      skipped.push({ ...deployment, reason: 'production-protected' });
      return;
    }

    toDelete.push(deployment);
  });

  return {
    total: deployments.length,
    toDelete,
    skipped,
    options: {
      keepLatest,
      skipProduction,
      maxAgeDays: cutoff ? maxAgeDays : undefined
    }
  };
}

export function parseOptionalNonNegativeInteger(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Use a non-negative whole number.');
  }

  return parsed;
}

export function formatDeploymentSummary(plan) {
  const protectedCount = plan.skipped.filter(item => item.reason !== 'too-new').length;
  const tooNewCount = plan.skipped.length - protectedCount;

  return [
    `${plan.toDelete.length} deployment(s) selected for deletion`,
    `${protectedCount} protected by safety settings`,
    `${tooNewCount} excluded by age filter`,
    `${plan.total} deployment(s) scanned`
  ].join('; ');
}

export function createCloudflareApi({ token, accountId, fetchImpl = globalThis.fetch }) {
  if (!token) {
    throw new Error('Cloudflare API token is required.');
  }

  if (!accountId) {
    throw new Error('Cloudflare Account ID is required.');
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('This VS Code runtime does not provide fetch.');
  }

  async function request(path, options = {}) {
    const response = await fetchImpl(`${DEFAULT_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {})
      }
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (_error) {
      payload = null;
    }

    if (!response.ok || payload?.success === false) {
      const cloudflareMessage = payload?.errors
        ?.map(error => error.message)
        .filter(Boolean)
        .join('; ');
      throw new Error(cloudflareMessage || `Cloudflare API request failed (${response.status})`);
    }

    return payload;
  }

  async function listPagesProjects() {
    const projects = [];
    let page = 1;
    let totalPages = 1;

    do {
      const payload = await request(
        `/accounts/${encodeURIComponent(accountId)}/pages/projects?page=${page}&per_page=${PAGE_SIZE}`
      );
      projects.push(...(payload.result ?? []));
      totalPages = payload.result_info?.total_pages ?? page;
      page += 1;
    } while (page <= totalPages);

    return projects;
  }

  async function listWorkersScripts() {
    const payload = await request(`/accounts/${encodeURIComponent(accountId)}/workers/scripts`);
    return payload.result ?? [];
  }

  async function listPagesDeployments(projectName) {
    const deployments = [];
    let page = 1;
    let totalPages = 1;

    do {
      const payload = await request(
        `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(
          projectName
        )}/deployments?page=${page}&per_page=${PAGE_SIZE}`
      );
      deployments.push(...(payload.result ?? []));
      totalPages = payload.result_info?.total_pages ?? page;
      page += 1;
    } while (page <= totalPages);

    return deployments;
  }

  async function deletePagesDeployment(projectName, deploymentId) {
    await request(
      `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(
        projectName
      )}/deployments/${encodeURIComponent(deploymentId)}?force=true`,
      {
        method: 'DELETE'
      }
    );
  }

  return {
    listPagesProjects,
    listWorkersScripts,
    listPagesDeployments,
    deletePagesDeployment
  };
}
