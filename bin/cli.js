#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { ServiceManager } from '../src/lib/service-manager.js';
import { logger } from '../src/utils/logger.js';
import { config } from '../src/config/config.js';
import dayjs from 'dayjs';

// Package info
const program = new Command();
program
  .name('cf-bulk-delete')
  .description('Tool for bulk deleting Cloudflare Pages and Workers deployments')
  .version('1.0.0');

// Global options
program
  .option('-t, --token <token>', 'Cloudflare API Token')
  .option('-a, --account <account>', 'Cloudflare Account ID')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--dry-run', 'Run simulation without actually deleting deployments');

/**
 * Utility function for formatting output
 */
function formatTable(data, columns) {
  if (!data || data.length === 0) {
    console.log(chalk.yellow('No data to display'));
    return;
  }

  // Calculate column widths
  const widths = {};
  columns.forEach(col => {
    widths[col.key] = Math.max(
      col.label.length,
      ...data.map(row => String(row[col.key] || '').length)
    );
  });

  // Print header
  const header = columns.map(col => chalk.bold(col.label.padEnd(widths[col.key]))).join(' | ');
  console.log(header);
  console.log('-'.repeat(header.length));

  // Print rows
  data.forEach(row => {
    const line = columns
      .map(col => {
        const value = String(row[col.key] || '');
        return col.color ? col.color(value.padEnd(widths[col.key])) : value.padEnd(widths[col.key]);
      })
      .join(' | ');
    console.log(line);
  });
}

/**
 * Setup service manager with error handling
 */
async function setupServiceManager(options) {
  const apiToken = options.token || config.cloudflare.apiToken;
  const accountId = options.account || config.cloudflare.accountId;

  if (!apiToken) {
    console.error(chalk.red('Error: Cloudflare API Token is required'));
    console.log(chalk.yellow('Use --token flag or set CLOUDFLARE_API_TOKEN environment variable'));
    process.exit(1);
  }

  if (!accountId) {
    console.error(chalk.red('Error: Cloudflare Account ID is required'));
    console.log(
      chalk.yellow('Use --account flag or set CLOUDFLARE_ACCOUNT_ID environment variable')
    );
    process.exit(1);
  }

  if (options.verbose) {
    logger.level = 'debug';
  }

  const serviceManager = new ServiceManager(apiToken, accountId);

  // Validate connections
  const spinner = ora('Validating Cloudflare API connections...').start();
  try {
    const validation = await serviceManager.validateConnections();

    if (!validation.overall) {
      spinner.fail('API validation failed');
      console.error(chalk.red('Check your API Token and Account ID'));
      process.exit(1);
    }

    spinner.succeed('API connections successfully validated');
    return serviceManager;
  } catch (error) {
    spinner.fail('Failed to validate API connections');
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

/**
 * Command: List resources
 */
program
  .command('list')
  .alias('ls')
  .description('List all Cloudflare Pages and Workers resources')
  .option('-s, --stats', 'Show deployment statistics')
  .action(async options => {
    try {
      const serviceManager = await setupServiceManager(program.opts());

      const spinner = ora('Fetching resources list...').start();
      const resources = await serviceManager.listAllResources();
      spinner.stop();

      console.log(chalk.blue('\n=== Cloudflare Pages Projects ==='));
      if (resources.pages.length > 0) {
        formatTable(resources.pages, [
          { key: 'name', label: 'Project Name', color: chalk.green },
          { key: 'subdomain', label: 'Subdomain', color: chalk.cyan },
          { key: 'created_on', label: 'Created', color: chalk.gray }
        ]);
      } else {
        console.log(chalk.yellow('No Pages projects found'));
      }

      console.log(chalk.blue('\n=== Cloudflare Workers Scripts ==='));
      if (resources.workers.length > 0) {
        formatTable(resources.workers, [
          { key: 'name', label: 'Script Name', color: chalk.green },
          { key: 'created_on', label: 'Created', color: chalk.gray },
          { key: 'modified_on', label: 'Modified', color: chalk.gray }
        ]);
      } else {
        console.log(chalk.yellow('No Workers scripts found'));
      }

      if (options.stats) {
        console.log(chalk.blue('\n=== Deployment Statistics ==='));
        const spinner2 = ora('Fetching deployment statistics...').start();

        try {
          const stats = await serviceManager.getComprehensiveStats();
          spinner2.stop();

          console.log(`Total Resources: ${chalk.bold(stats.summary.totalResources)}`);
          console.log(`Total Deployments: ${chalk.bold(stats.summary.totalDeployments)}`);
          console.log(`Pages Projects: ${chalk.bold(stats.pages.totalProjects)}`);
          console.log(`Workers Scripts: ${chalk.bold(stats.workers.totalScripts)}`);

          if (stats.summary.oldestDeployment) {
            console.log(
              `Oldest Deployment: ${chalk.gray(dayjs(stats.summary.oldestDeployment).format('YYYY-MM-DD HH:mm:ss'))}`
            );
          }
          if (stats.summary.newestDeployment) {
            console.log(
              `Newest Deployment: ${chalk.gray(dayjs(stats.summary.newestDeployment).format('YYYY-MM-DD HH:mm:ss'))}`
            );
          }
        } catch (error) {
          spinner2.fail('Failed to fetch statistics');
          console.error(chalk.red(error.message));
        }
      }

      console.log(
        chalk.green(
          `\nTotal: ${resources.pages.length} Pages projects, ${resources.workers.length} Workers scripts`
        )
      );
    } catch (error) {
      console.error(chalk.red('Error:', error.message));
      process.exit(1);
    }
  });

/**
 * Command: List deployments for specific resource
 */
program
  .command('deployments <type> <name>')
  .description('List deployments for specific resource (pages|workers)')
  .option('-e, --environment <env>', 'Filter by environment (for Pages)')
  .option('--max-age <days>', 'Filter deployments older than X days', parseInt)
  .option('--status <status>', 'Filter by deployment status')
  .action(async (type, name, options) => {
    try {
      if (!['pages', 'workers'].includes(type)) {
        console.error(chalk.red('Error: Type must be "pages" or "workers"'));
        process.exit(1);
      }

      const serviceManager = await setupServiceManager(program.opts());

      const spinner = ora(`Fetching deployments for ${type} "${name}"...`).start();
      const deployments = await serviceManager.listDeployments(type, name, {
        environment: options.environment,
        maxAge: options.maxAge,
        status: options.status
      });
      spinner.stop();

      if (deployments.length === 0) {
        console.log(chalk.yellow(`No deployments found for ${type} "${name}"`));
        return;
      }

      console.log(chalk.blue(`\n=== Deployments for ${type.toUpperCase()} "${name}" ===`));

      const columns = [
        { key: 'id', label: 'Deployment ID', color: chalk.green },
        { key: 'created_on', label: 'Created', color: chalk.gray }
      ];

      if (type === 'pages') {
        columns.splice(2, 0, { key: 'environment', label: 'Environment', color: chalk.cyan });
      } else {
        columns.splice(2, 0, { key: 'version', label: 'Version', color: chalk.cyan });
      }

      formatTable(deployments, columns);

      console.log(chalk.green(`\nTotal: ${deployments.length} deployments`));
    } catch (error) {
      console.error(chalk.red('Error:', error.message));
      process.exit(1);
    }
  });

/**
 * Command: Bulk delete deployments
 */
program
  .command('delete <type> <name>')
  .description('Bulk delete deployments for specific resource')
  .option('-e, --environment <env>', 'Filter by environment (for Pages)')
  .option('--max-age <days>', 'Delete deployments older than X days', parseInt)
  .option('--status <status>', 'Filter by deployment status')
  .option('--skip-production', 'Skip production deployments (default for Pages)')
  .option('--skip-latest', 'Skip latest deployment (default for Workers)')
  .option('--batch-size <size>', 'Number of deployments per batch', parseInt)
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (type, name, options) => {
    try {
      if (!['pages', 'workers'].includes(type)) {
        console.error(chalk.red('Error: Type must be "pages" or "workers"'));
        process.exit(1);
      }

      const serviceManager = await setupServiceManager(program.opts());
      const isDryRun = program.opts().dryRun;

      // Get deployments to delete
      const spinner = ora(`Fetching deployments for ${type} "${name}"...`).start();
      const deployments = await serviceManager.listDeployments(type, name, {
        environment: options.environment,
        maxAge: options.maxAge,
        status: options.status
      });
      spinner.stop();

      if (deployments.length === 0) {
        console.log(chalk.yellow(`No deployments found for ${type} "${name}"`));
        return;
      }

      // Try to get total count information for better display
      let totalInfo = '';
      if (type === 'pages' && deployments.length > 0 && deployments[0].totalCount) {
        totalInfo = `/${deployments[0].totalCount}`;
      }

      console.log(
        chalk.blue(`\nFound ${deployments.length}${totalInfo} deployments for ${type} "${name}"`)
      );

      // Show preview
      if (deployments.length <= 10) {
        formatTable(deployments.slice(0, 10), [
          { key: 'id', label: 'Deployment ID', color: chalk.yellow },
          { key: 'created_on', label: 'Created', color: chalk.gray },
          {
            key: type === 'pages' ? 'environment' : 'version',
            label: type === 'pages' ? 'Environment' : 'Version',
            color: chalk.cyan
          }
        ]);
      } else {
        console.log(`Showing first 10 deployments out of ${deployments.length} total:`);
        formatTable(deployments.slice(0, 10), [
          { key: 'id', label: 'Deployment ID', color: chalk.yellow },
          { key: 'created_on', label: 'Created', color: chalk.gray },
          {
            key: type === 'pages' ? 'environment' : 'version',
            label: type === 'pages' ? 'Environment' : 'Version',
            color: chalk.cyan
          }
        ]);
        console.log(chalk.gray(`... and ${deployments.length - 10} more deployments`));
      }

      // Confirmation
      if (!options.yes && !isDryRun) {
        const answer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: chalk.red(
              `Are you sure you want to delete ${deployments.length} deployments?`
            ),
            default: false
          }
        ]);

        if (!answer.confirm) {
          console.log(chalk.yellow('Operation cancelled'));
          return;
        }
      }

      // Perform bulk delete
      const deleteOptions = {
        dryRun: isDryRun,
        skipProduction: options.skipProduction !== false && type === 'pages',
        skipLatest: options.skipLatest !== false && type === 'workers',
        batchSize: options.batchSize
      };

      const result = await serviceManager.bulkDeleteDeployments(
        type,
        name,
        deployments,
        deleteOptions
      );

      // Display results
      console.log(`\n${chalk.blue('=== Bulk Delete Results ===')}`);
      console.log(`${chalk.green('Success')}: ${result.success}`);
      console.log(`${chalk.red('Failed')}: ${result.failed}`);
      console.log(`${chalk.yellow('Skipped')}: ${result.skipped}`);
      console.log(`${chalk.gray('Total')}: ${result.total}`);
      console.log(`${chalk.gray('Duration')}: ${(result.duration / 1000).toFixed(1)}s`);
      console.log(`${chalk.gray('Rate')}: ${result.rate ? result.rate.toFixed(1) : 0}/s`);

      if (isDryRun) {
        console.log(chalk.yellow('\n[DRY RUN] No deployments were actually deleted'));
      } else if (result.success > 0) {
        console.log(chalk.green(`\n✓ ${result.success} deployments successfully deleted`));
      }
    } catch (error) {
      console.error(chalk.red('Error:', error.message));
      process.exit(1);
    }
  });

/**
 * Command: Delete entire resource (project/script)
 */
program
  .command('destroy <type> <name>')
  .description('🚨 PERMANENTLY DELETE entire Pages project or Workers script')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (type, name, options) => {
    try {
      if (!['pages', 'workers'].includes(type)) {
        console.error(chalk.red('Error: Type must be "pages" or "workers"'));
        process.exit(1);
      }

      const serviceManager = await setupServiceManager(program.opts());
      const isDryRun = program.opts().dryRun;

      console.log(
        chalk.red.bold(
          `\n🚨 DANGER: You are about to PERMANENTLY DELETE the entire ${type} resource!`
        )
      );
      console.log(chalk.yellow(`Resource: ${type.toUpperCase()} "${name}"`));
      console.log(chalk.yellow('This action will:'));
      console.log(
        chalk.yellow(
          `  • Delete the ${type === 'pages' ? 'Pages project' : 'Workers script'} permanently`
        )
      );
      console.log(chalk.yellow('  • Delete ALL associated deployments/versions'));
      console.log(chalk.yellow('  • Remove ALL configuration and data'));
      console.log(chalk.red.bold('  • THIS CANNOT BE UNDONE!'));

      if (!options.yes && !isDryRun) {
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'confirmation',
            message: chalk.red(`Type the resource name "${name}" to confirm permanent deletion:`),
            validate: input => {
              if (input === name) return true;
              return `You must type "${name}" exactly to confirm.`;
            }
          },
          {
            type: 'confirm',
            name: 'finalConfirm',
            message: chalk.red('Are you absolutely sure? This action cannot be undone!'),
            default: false
          }
        ]);

        if (!answer.finalConfirm) {
          console.log(chalk.yellow('Operation cancelled - resource not deleted'));
          return;
        }
      }

      // Perform deletion
      const result = await serviceManager.deleteResource(type, name, { dryRun: isDryRun });

      if (isDryRun) {
        console.log(chalk.yellow(`\n[DRY RUN] Would have permanently deleted ${type} "${name}"`));
      } else if (result.success) {
        console.log(
          chalk.green(`\n✓ ${type.toUpperCase()} "${name}" has been permanently deleted`)
        );
      }
    } catch (error) {
      console.error(chalk.red('Error:', error.message));
      process.exit(1);
    }
  });

/**
 * Command: Interactive mode
 */
program
  .command('interactive')
  .alias('i')
  .description('Interactive mode for managing deployments')
  .action(async () => {
    try {
      const serviceManager = await setupServiceManager(program.opts());

      console.log(chalk.blue('\n=== Cloudflare Bulk Delete Interactive Mode ===\n'));

      // Get all resources
      const spinner = ora('Fetching resources list...').start();
      const resources = await serviceManager.listAllResources();
      spinner.stop();

      if (resources.pages.length === 0 && resources.workers.length === 0) {
        console.log(chalk.yellow('No resources found'));
        return;
      }

      // Build choices for resource selection
      const resourceChoices = [];

      if (resources.pages.length > 0) {
        resourceChoices.push(new inquirer.Separator('--- Cloudflare Pages ---'));
        resources.pages.forEach(project => {
          resourceChoices.push({
            name: `${project.name} (Pages)`,
            value: { type: 'pages', name: project.name, data: project }
          });
        });
      }

      if (resources.workers.length > 0) {
        resourceChoices.push(new inquirer.Separator('--- Cloudflare Workers ---'));
        resources.workers.forEach(script => {
          resourceChoices.push({
            name: `${script.name} (Workers)`,
            value: { type: 'workers', name: script.name, data: script }
          });
        });
      }

      // Resource selection
      const { selectedResource } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedResource',
          message: 'Select resource to manage:',
          choices: resourceChoices,
          pageSize: 15
        }
      ]);

      // Get deployments for selected resource
      const spinner2 = ora(`Fetching deployments for ${selectedResource.name}...`).start();
      const deployments = await serviceManager.listDeployments(
        selectedResource.type,
        selectedResource.name
      );
      spinner2.stop();

      if (deployments.length === 0) {
        console.log(chalk.yellow(`No deployments for ${selectedResource.name}`));
        return;
      }

      // Try to get total count information for better display
      let totalInfo = '';
      if (
        selectedResource.type === 'pages' &&
        deployments.length > 0 &&
        deployments[0].totalCount
      ) {
        totalInfo = `/${deployments[0].totalCount}`;
      }

      console.log(
        chalk.green(
          `\nFound ${deployments.length}${totalInfo} deployments for ${selectedResource.name}`
        )
      );

      // Action selection
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'Choose action:',
          choices: [
            { name: 'View all deployments', value: 'view' },
            { name: 'Bulk delete deployments', value: 'delete' },
            { name: 'View statistics', value: 'stats' },
            new inquirer.Separator(),
            { name: '🚨 PERMANENTLY DELETE entire resource', value: 'destroy' },
            new inquirer.Separator(),
            { name: 'Back', value: 'back' }
          ]
        }
      ]);

      switch (action) {
        case 'view':
          formatTable(deployments, [
            { key: 'id', label: 'Deployment ID', color: chalk.green },
            { key: 'created_on', label: 'Created', color: chalk.gray },
            {
              key: selectedResource.type === 'pages' ? 'environment' : 'version',
              label: selectedResource.type === 'pages' ? 'Environment' : 'Version',
              color: chalk.cyan
            }
          ]);
          break;

        case 'delete': {
          // Advanced delete options for professional use
          console.log(chalk.blue('\n=== Bulk Delete Configuration ==='));

          const deleteConfig = await inquirer.prompt([
            {
              type: 'list',
              name: 'protectionMode',
              message: 'Select protection mode:',
              choices: [
                {
                  name: 'Safe Mode - Keep latest deployments protected (Recommended)',
                  value: 'safe',
                  short: 'Safe Mode'
                },
                {
                  name: 'Production Protected - Skip all production environments',
                  value: 'production',
                  short: 'Production Protected'
                },
                {
                  name: 'Force Delete - Delete all selected deployments (Dangerous)',
                  value: 'force',
                  short: 'Force Delete'
                }
              ],
              default: 'safe'
            }
          ]);

          const deleteOptions = { dryRun: program.opts().dryRun };
          let warningMessage = '';

          switch (deleteConfig.protectionMode) {
            case 'safe':
              deleteOptions.skipProduction = true;
              deleteOptions.keepLatest = selectedResource.type === 'pages' ? 2 : 1;
              warningMessage = `This will keep the latest ${deleteOptions.keepLatest} deployments safe and skip production environments.`;
              break;
            case 'production':
              deleteOptions.skipProduction = true;
              deleteOptions.keepLatest = 0;
              warningMessage =
                'This will skip all production deployments but may delete recent deployments.';
              break;
            case 'force':
              deleteOptions.skipProduction = false;
              deleteOptions.keepLatest = 0;
              warningMessage = chalk.red(
                '⚠️  DANGER: This will delete ALL deployments including production!'
              );
              break;
          }

          console.log(chalk.yellow(`\n${warningMessage}`));

          const { confirmDelete } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmDelete',
              message: chalk.red(
                `Are you sure you want to proceed with deleting deployments from ${selectedResource.name}?`
              ),
              default: false
            }
          ]);

          if (confirmDelete) {
            const result = await serviceManager.bulkDeleteDeployments(
              selectedResource.type,
              selectedResource.name,
              deployments,
              deleteOptions
            );

            console.log(`\n${chalk.blue('=== Bulk Delete Results ===')}`);
            console.log(`${chalk.green('Success')}: ${result.success}`);
            console.log(`${chalk.red('Failed')}: ${result.failed}`);
            console.log(`${chalk.yellow('Skipped')}: ${result.skipped}`);
            console.log(`${chalk.gray('Total')}: ${result.total || deployments.length}`);

            if (program.opts().dryRun) {
              console.log(chalk.yellow('\n[DRY RUN] No deployments were actually deleted'));
            } else if (result.success > 0) {
              console.log(chalk.green(`\n✓ ${result.success} deployments successfully deleted`));
            }
          } else {
            console.log(chalk.yellow('Operation cancelled'));
          }
          break;
        }

        case 'stats': {
          const spinner3 = ora('Fetching statistics...').start();
          try {
            const stats =
              selectedResource.type === 'pages'
                ? await serviceManager.pagesClient.getDeploymentStats(selectedResource.name)
                : await serviceManager.workersClient.getDeploymentStats(selectedResource.name);
            spinner3.stop();

            console.log(chalk.blue('\n=== Deployment Statistics ==='));
            console.log(`Total Deployments: ${chalk.bold(stats.total)}`);
            if (stats.byEnvironment) {
              console.log('\nBy Environment:');
              Object.entries(stats.byEnvironment).forEach(([env, count]) => {
                console.log(`  ${env}: ${count}`);
              });
            }
            if (stats.byVersion) {
              console.log('\nBy Version:');
              Object.entries(stats.byVersion).forEach(([version, count]) => {
                console.log(`  v${version}: ${count}`);
              });
            }
          } catch (error) {
            spinner3.fail('Failed to fetch statistics');
            console.error(chalk.red(error.message));
          }
          break;
        }

        case 'destroy': {
          console.log(chalk.red.bold('\n🚨 PERMANENT DELETION WARNING'));
          console.log(
            chalk.yellow(
              `You are about to permanently delete the entire ${selectedResource.type}: "${selectedResource.name}"`
            )
          );
          console.log(chalk.red('This will delete:'));
          console.log(chalk.red('  • The entire project/script'));
          console.log(chalk.red('  • ALL deployments/versions'));
          console.log(chalk.red('  • ALL configuration'));
          console.log(chalk.red.bold('  • THIS CANNOT BE UNDONE!'));

          const confirmDestroy = await inquirer.prompt([
            {
              type: 'input',
              name: 'resourceName',
              message: chalk.red(`Type the resource name "${selectedResource.name}" to confirm:`),
              validate: input => {
                if (input === selectedResource.name) return true;
                return `You must type "${selectedResource.name}" exactly.`;
              }
            },
            {
              type: 'confirm',
              name: 'finalConfirm',
              message: chalk.red('Are you absolutely sure? This CANNOT be undone!'),
              default: false
            }
          ]);

          if (confirmDestroy.finalConfirm) {
            const result = await serviceManager.deleteResource(
              selectedResource.type,
              selectedResource.name,
              { dryRun: program.opts().dryRun }
            );

            if (program.opts().dryRun) {
              console.log(
                chalk.yellow(
                  `\n[DRY RUN] Would permanently delete ${selectedResource.type} "${selectedResource.name}"`
                )
              );
            } else if (result.success) {
              console.log(
                chalk.green(
                  `\n✅ ${selectedResource.type.toUpperCase()} "${selectedResource.name}" permanently deleted`
                )
              );
            }
          } else {
            console.log(chalk.yellow('Operation cancelled - resource not deleted'));
          }
          break;
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:', error.message));
      process.exit(1);
    }
  });

// Error handling
program.exitOverride();

try {
  program.parse();
} catch (error) {
  if (error.code === 'commander.helpDisplayed') {
    process.exit(0);
  }
  console.error(chalk.red('Error:', error.message));
  process.exit(1);
}

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
