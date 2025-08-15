# Fix "Your project has too many deployments to be deleted"

**The fastest way to bulk delete Cloudflare Pages and Workers deployments.**

When Cloudflare shows "Your project has too many deployments to be deleted, follow this guide to delete them", this tool solves it in minutes instead of hours.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-green.svg)
![npm](https://img.shields.io/npm/v/cloudflare-bulk-delete)

## The Problem

Cloudflare limits manual deletion when you have too many deployments. The official solution involves tedious manual API calls. This tool automates the entire process safely.

**Before:** Hours of manual API calls
**After:** 3 commands, done in minutes

### Example: Real Solution in Action

```bash
$ cf-bulk-delete interactive
✓ API connections successfully validated

=== Cloudflare Pages Projects ===
1. my-blog-site (247 deployments)
2. portfolio-app (156 deployments)
3. docs-site (89 deployments)

? Select resource to manage: my-blog-site
✓ Found 247/247 deployments for my-blog-site

? Choose action: Bulk delete deployments
? Select protection mode: Safe Mode (Recommended)

Preview: Will delete 245 deployments (keeping latest 2, skipping production)
? Proceed with deletion? Yes

⠋ Deleting deployments... 89/245 completed
✓ Cleanup completed: 245 succeeded, 0 failed
Duration: 2.3s | Rate: 106.5/s

Problem solved! 🎉
```

## Common Error Messages This Tool Fixes

**Cloudflare Dashboard Error:**

> ❌ "Your project has too many deployments to be deleted, follow this guide to delete them: https://cfl.re/3CXesln"

**Our Solution:**

> ✅ `cf-bulk-delete interactive` - Delete hundreds of deployments in seconds

## Quick Start

```bash
# 1. Install
npm install -g cloudflare-bulk-delete

# 2. Set your credentials
export CLOUDFLARE_API_TOKEN=your_token_here
export CLOUDFLARE_ACCOUNT_ID=your_account_id_here

# 3. Clean up deployments
cf-bulk-delete interactive
```

## Installation

```bash
npm install -g cloudflare-bulk-delete
```

## Setup

1. **Get API Token:** [Create token](https://dash.cloudflare.com/profile/api-tokens) with `Cloudflare Pages:Edit` and `Workers Scripts:Write` permissions

2. **Find Account ID:** Available in your Cloudflare Dashboard sidebar

3. **Set Environment Variables:**

```bash
export CLOUDFLARE_API_TOKEN=your_token_here
export CLOUDFLARE_ACCOUNT_ID=your_account_id_here
```

## Usage

### Interactive Mode (Recommended)

```bash
cf-bulk-delete interactive
```

Choose your resources, select protection level, confirm deletion.

### Direct Commands

```bash
# List all resources
cf-bulk-delete list

# Preview cleanup (safe)
cf-bulk-delete delete pages my-project --max-age 30 --dry-run

# Execute cleanup
cf-bulk-delete delete pages my-project --max-age 30

# Clean old preview deployments only
cf-bulk-delete delete pages my-project --environment preview --max-age 7
```

## Safety Features

- **Dry-run mode** - Preview before deletion
- **Production protection** - Skips production deployments by default
- **Latest deployment protection** - Keeps most recent deployment
- **Batch processing** - Rate-limited to avoid API throttling

## Command Reference

```bash
# Core commands
cf-bulk-delete list                           # List all resources
cf-bulk-delete deployments pages my-project  # Show deployments
cf-bulk-delete delete pages my-project       # Bulk delete
cf-bulk-delete interactive                   # Interactive mode

# Options
--dry-run              # Preview only
--max-age <days>       # Delete older than X days
--environment <env>    # Target specific environment
--skip-production      # Skip production (default: true)
--batch-size <n>       # Process in batches (default: 10)
```

## Examples

**Emergency cleanup (keeps production safe):**

```bash
cf-bulk-delete delete pages my-project --max-age 7 --dry-run
cf-bulk-delete delete pages my-project --max-age 7
```

**Clean only preview deployments:**

```bash
cf-bulk-delete delete pages my-project --environment preview --max-age 1
```

**Workers version cleanup:**

```bash
cf-bulk-delete delete workers my-script --max-age 30
```

## Programmatic Usage

```javascript
import { ServiceManager } from 'cloudflare-bulk-delete';

const manager = new ServiceManager(apiToken, accountId);

// Get deployments
const deployments = await manager.listDeployments('pages', 'my-project');

// Bulk delete
const result = await manager.bulkDeleteDeployments('pages', 'my-project', deployments, {
  skipProduction: true,
  dryRun: false
});

console.log(`Deleted: ${result.success}, Failed: ${result.failed}`);
```

## Troubleshooting

**"Invalid API Token"**

- Verify token permissions: `Cloudflare Pages:Edit` and `Workers Scripts:Write`
- Check token hasn't expired

**"Too Many Requests"**

- Tool has built-in rate limiting
- Reduce batch size: `--batch-size 5`

**Debug mode:**

```bash
LOG_LEVEL=debug cf-bulk-delete list
```

## License

MIT License - see [LICENSE](LICENSE)

---

**Solves:** Cloudflare "too many deployments to be deleted" error  
**Author:** [Rama Aditya](https://github.com/RamaAditya49)  
**Repository:** [https://github.com/RamaAditya49/cloudflare-bulk-delete](https://github.com/RamaAditya49/cloudflare-bulk-delete)
