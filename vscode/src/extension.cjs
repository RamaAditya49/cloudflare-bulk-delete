const vscode = require('vscode');

const SECRET_TOKEN_KEY = 'cloudflareBulkDelete.apiToken';
const GLOBAL_ACCOUNT_ID_KEY = 'cloudflareBulkDelete.accountId';

let cloudflareModulePromise;
let outputChannel;

function loadCloudflareModule() {
  if (!cloudflareModulePromise) {
    cloudflareModulePromise = import('./cloudflare.js');
  }

  return cloudflareModulePromise;
}

function getOutputChannel() {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Cloudflare Bulk Delete');
  }

  return outputChannel;
}

function getConfiguration() {
  return vscode.workspace.getConfiguration('cloudflareBulkDelete');
}

async function configureCredentials(context) {
  const configuration = getConfiguration();
  const existingAccountId =
    context.globalState.get(GLOBAL_ACCOUNT_ID_KEY) || configuration.get('accountId') || '';

  const accountId = await vscode.window.showInputBox({
    title: 'Cloudflare Bulk Delete',
    prompt: 'Cloudflare Account ID',
    value: existingAccountId,
    ignoreFocusOut: true,
    validateInput: value => (value.trim() ? undefined : 'Account ID is required.')
  });

  if (!accountId) {
    return false;
  }

  const apiToken = await vscode.window.showInputBox({
    title: 'Cloudflare Bulk Delete',
    prompt: 'Cloudflare API token',
    password: true,
    ignoreFocusOut: true,
    validateInput: value => (value.trim() ? undefined : 'API token is required.')
  });

  if (!apiToken) {
    return false;
  }

  await context.globalState.update(GLOBAL_ACCOUNT_ID_KEY, accountId.trim());
  await context.secrets.store(SECRET_TOKEN_KEY, apiToken.trim());

  vscode.window.showInformationMessage('Cloudflare credentials saved in VS Code Secret Storage.');
  return true;
}

async function getCredentials(context) {
  const configuration = getConfiguration();
  let accountId = context.globalState.get(GLOBAL_ACCOUNT_ID_KEY) || configuration.get('accountId');
  let token = await context.secrets.get(SECRET_TOKEN_KEY);

  if (accountId && token) {
    return { accountId, token };
  }

  const action = await vscode.window.showWarningMessage(
    'Cloudflare credentials are not configured.',
    'Configure',
    'Cancel'
  );

  if (action !== 'Configure') {
    return null;
  }

  const configured = await configureCredentials(context);
  if (!configured) {
    return null;
  }

  accountId = context.globalState.get(GLOBAL_ACCOUNT_ID_KEY) || configuration.get('accountId');
  token = await context.secrets.get(SECRET_TOKEN_KEY);
  return accountId && token ? { accountId, token } : null;
}

async function createApi(context) {
  const credentials = await getCredentials(context);
  if (!credentials) {
    return null;
  }

  const { createCloudflareApi } = await loadCloudflareModule();
  return createCloudflareApi(credentials);
}

async function listResources(context) {
  const api = await createApi(context);
  if (!api) {
    return;
  }

  try {
    const { pagesProjects, workerScripts } = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Loading Cloudflare resources'
      },
      async () => {
        const [pagesProjectsResult, workerScriptsResult] = await Promise.all([
          api.listPagesProjects(),
          api.listWorkersScripts()
        ]);

        return {
          pagesProjects: pagesProjectsResult,
          workerScripts: workerScriptsResult
        };
      }
    );

    const items = [
      ...pagesProjects.map(project => ({
        label: project.name,
        description: 'Pages',
        detail: project.subdomain || project.domains?.join(', ') || undefined
      })),
      ...workerScripts.map(script => ({
        label: script.id || script.name,
        description: 'Workers',
        detail: script.modified_on ? `Modified ${script.modified_on}` : undefined
      }))
    ];

    if (items.length === 0) {
      vscode.window.showInformationMessage(
        'No Cloudflare Pages projects or Workers scripts found.'
      );
      return;
    }

    await vscode.window.showQuickPick(items, {
      title: 'Cloudflare Resources',
      placeHolder: `${pagesProjects.length} Pages project(s), ${workerScripts.length} Workers script(s)`
    });
  } catch (error) {
    vscode.window.showErrorMessage(`Cloudflare resource list failed: ${error.message}`);
  }
}

async function promptCleanupOptions() {
  const configuration = getConfiguration();
  const defaultKeepLatest = Number(configuration.get('defaultKeepLatest') ?? 1);
  const defaultSkipProduction = configuration.get('defaultSkipProduction') !== false;
  const { parseOptionalNonNegativeInteger } = await loadCloudflareModule();

  const keepLatestValue = await vscode.window.showInputBox({
    title: 'Cloudflare Bulk Delete',
    prompt: 'How many newest Pages deployments should stay protected?',
    value: String(defaultKeepLatest),
    ignoreFocusOut: true,
    validateInput: value => {
      try {
        parseOptionalNonNegativeInteger(value);
        return undefined;
      } catch (error) {
        return error.message;
      }
    }
  });

  if (keepLatestValue === undefined) {
    return null;
  }

  const maxAgeValue = await vscode.window.showInputBox({
    title: 'Cloudflare Bulk Delete',
    prompt: 'Only target deployments older than this many days. Leave blank for no age filter.',
    value: '',
    ignoreFocusOut: true,
    validateInput: value => {
      try {
        parseOptionalNonNegativeInteger(value);
        return undefined;
      } catch (error) {
        return error.message;
      }
    }
  });

  if (maxAgeValue === undefined) {
    return null;
  }

  const productionChoice = await vscode.window.showQuickPick(
    [
      {
        label: 'Skip production deployments',
        description: defaultSkipProduction ? 'Default' : undefined,
        value: true
      },
      {
        label: 'Include production deployments',
        description: defaultSkipProduction ? undefined : 'Default',
        value: false
      }
    ],
    {
      title: 'Cloudflare Bulk Delete',
      placeHolder: 'Production safety'
    }
  );

  if (!productionChoice) {
    return null;
  }

  return {
    keepLatest: parseOptionalNonNegativeInteger(keepLatestValue) ?? 0,
    maxAgeDays: parseOptionalNonNegativeInteger(maxAgeValue),
    skipProduction: productionChoice.value
  };
}

function writePlan(projectName, plan) {
  const channel = getOutputChannel();
  channel.clear();
  channel.appendLine(`Project: ${projectName}`);
  channel.appendLine(`Scanned: ${plan.total}`);
  channel.appendLine(`Selected for deletion: ${plan.toDelete.length}`);
  channel.appendLine(`Skipped: ${plan.skipped.length}`);
  channel.appendLine('');

  if (plan.toDelete.length > 0) {
    channel.appendLine('Deployments selected for deletion:');
    plan.toDelete.forEach(deployment => {
      channel.appendLine(
        `- ${deployment.id} (${deployment.environment || 'unknown'}) ${deployment.created_on}`
      );
    });
    channel.appendLine('');
  }

  if (plan.skipped.length > 0) {
    channel.appendLine('Skipped deployments:');
    plan.skipped.forEach(deployment => {
      channel.appendLine(
        `- ${deployment.id} (${deployment.reason}) ${deployment.environment || 'unknown'} ${
          deployment.created_on
        }`
      );
    });
  }

  channel.show(true);
}

async function runPagesCleanup(context, commit) {
  const api = await createApi(context);
  if (!api) {
    return;
  }

  try {
    const projects = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Loading Cloudflare Pages projects'
      },
      () => api.listPagesProjects()
    );

    if (projects.length === 0) {
      vscode.window.showInformationMessage('No Cloudflare Pages projects found.');
      return;
    }

    const selectedProject = await vscode.window.showQuickPick(
      projects.map(project => ({
        label: project.name,
        description: project.subdomain,
        project
      })),
      {
        title: 'Cloudflare Pages Project',
        placeHolder: 'Select a project'
      }
    );

    if (!selectedProject) {
      return;
    }

    const cleanupOptions = await promptCleanupOptions();
    if (!cleanupOptions) {
      return;
    }

    const { formatDeploymentSummary, planPagesDeletion } = await loadCloudflareModule();
    const deployments = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Loading deployments for ${selectedProject.project.name}`
      },
      () => api.listPagesDeployments(selectedProject.project.name)
    );

    const plan = planPagesDeletion(deployments, cleanupOptions);
    writePlan(selectedProject.project.name, plan);

    if (plan.toDelete.length === 0) {
      vscode.window.showInformationMessage(`Nothing to delete. ${formatDeploymentSummary(plan)}`);
      return;
    }

    if (!commit) {
      vscode.window.showInformationMessage(`Preview ready. ${formatDeploymentSummary(plan)}`);
      return;
    }

    const confirmation = await vscode.window.showWarningMessage(
      `Delete ${plan.toDelete.length} deployment(s) from ${selectedProject.project.name}? This cannot be undone.`,
      { modal: true },
      `Delete ${plan.toDelete.length}`,
      'Cancel'
    );

    if (confirmation !== `Delete ${plan.toDelete.length}`) {
      return;
    }

    const failures = [];
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Deleting deployments from ${selectedProject.project.name}`,
        cancellable: false
      },
      async progress => {
        for (let index = 0; index < plan.toDelete.length; index += 1) {
          const deployment = plan.toDelete[index];
          progress.report({
            message: `${index + 1}/${plan.toDelete.length}: ${deployment.id}`,
            increment: 100 / plan.toDelete.length
          });

          try {
            await api.deletePagesDeployment(selectedProject.project.name, deployment.id);
          } catch (error) {
            failures.push({ deployment, error });
          }
        }
      }
    );

    if (failures.length > 0) {
      const channel = getOutputChannel();
      channel.appendLine('');
      channel.appendLine('Delete failures:');
      failures.forEach(({ deployment, error }) => {
        channel.appendLine(`- ${deployment.id}: ${error.message}`);
      });
      channel.show(true);
      vscode.window.showWarningMessage(
        `Deleted ${plan.toDelete.length - failures.length}; ${failures.length} failed.`
      );
      return;
    }

    vscode.window.showInformationMessage(`Deleted ${plan.toDelete.length} deployment(s).`);
  } catch (error) {
    vscode.window.showErrorMessage(`Cloudflare cleanup failed: ${error.message}`);
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('cloudflareBulkDelete.configure', () =>
      configureCredentials(context)
    ),
    vscode.commands.registerCommand('cloudflareBulkDelete.listResources', () =>
      listResources(context)
    ),
    vscode.commands.registerCommand('cloudflareBulkDelete.previewPagesCleanup', () =>
      runPagesCleanup(context, false)
    ),
    vscode.commands.registerCommand('cloudflareBulkDelete.deletePagesDeployments', () =>
      runPagesCleanup(context, true)
    )
  );
}

function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
}

module.exports = {
  activate,
  deactivate
};
