/**
 * Pages will not delete the newest deployment of a branch, even with force=true.
 * Production deployments without branch metadata are treated as the production branch.
 */
export function pagesBranchKey(deployment) {
  const metadata = deployment?.deployment_trigger?.metadata ?? {};
  const branch = metadata.branch || metadata.branch_name || deployment?.branch;

  if (typeof branch === 'string' && branch.trim()) {
    return branch.trim();
  }

  if (deployment?.environment === 'production') {
    return 'production';
  }

  return null;
}

export function latestDeploymentIdsByBranch(deployments) {
  const newestFirst = [...deployments].sort(
    (left, right) => new Date(right.created_on) - new Date(left.created_on)
  );
  const seenBranches = new Set();
  const protectedIds = new Set();

  for (const deployment of newestFirst) {
    const branch = pagesBranchKey(deployment);
    if (!branch || seenBranches.has(branch) || !deployment?.id) {
      continue;
    }

    seenBranches.add(branch);
    protectedIds.add(deployment.id);
  }

  return protectedIds;
}
