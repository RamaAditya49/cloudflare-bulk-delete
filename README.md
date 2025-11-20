# Fix "Your project has too many deployments to be deleted"

**The fastest way to bulk delete Cloudflare Pages and Workers deployments.**

When Cloudflare shows "Your project has too many deployments to be deleted, follow this guide to delete them", this tool solves it in minutes instead of hours.

[![NPM Version](https://img.shields.io/npm/v/cloudflare-bulk-delete?style=flat-square&logo=npm&color=red)](https://www.npmjs.com/package/cloudflare-bulk-delete)
[![NPM Downloads](https://img.shields.io/npm/dm/cloudflare-bulk-delete?style=flat-square&logo=npm&color=orange)](https://www.npmjs.com/package/cloudflare-bulk-delete)
[![GitHub Release](https://img.shields.io/github/v/release/RamaAditya49/cloudflare-bulk-delete?style=flat-square&logo=github&color=blue)](https://github.com/RamaAditya49/cloudflare-bulk-delete/releases)
[![CI Status](https://img.shields.io/github/actions/workflow/status/RamaAditya49/cloudflare-bulk-delete/ci.yml?style=flat-square&logo=github-actions&label=CI)](https://github.com/RamaAditya49/cloudflare-bulk-delete/actions/workflows/ci.yml)
[![Release Status](https://img.shields.io/github/actions/workflow/status/RamaAditya49/cloudflare-bulk-delete/release.yml?style=flat-square&logo=github-actions&label=Release)](https://github.com/RamaAditya49/cloudflare-bulk-delete/actions/workflows/release.yml)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://github.com/RamaAditya49/cloudflare-bulk-delete/blob/main/LICENSE)
[![GitHub Issues](https://img.shields.io/github/issues/RamaAditya49/cloudflare-bulk-delete?style=flat-square&logo=github)](https://github.com/RamaAditya49/cloudflare-bulk-delete/issues)
[![GitHub Stars](https://img.shields.io/github/stars/RamaAditya49/cloudflare-bulk-delete?style=flat-square&logo=github)](https://github.com/RamaAditya49/cloudflare-bulk-delete/stargazers)

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

### Step 1: Create API Token

1. **Go to Cloudflare API Tokens page:**
   - Visit [https://dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Click **"Create Token"**

2. **Configure Token Permissions:**
   - Choose **"Create Custom Token"**
   - Set **Token name**: e.g., "Cloudflare Bulk Delete"
   - Add the following permissions:
     - **Account** → **Cloudflare Pages** → **Edit**
     - **Account** → **Workers Scripts** → **Edit**
   - Under **Account Resources**, select the specific account or "All accounts"
   - Click **"Continue to summary"** → **"Create Token"**

3. **Save Your Token:**
   - ⚠️ **Important**: Copy the token immediately - it won't be shown again!
   - Store it securely

### Step 2: Find Your Account ID

1. **From Cloudflare Dashboard:**
   - Go to [https://dash.cloudflare.com](https://dash.cloudflare.com)
   - Select any website/domain
   - Scroll down the right sidebar
   - Find **"Account ID"** under the API section
   - Click to copy

### Step 3: Set Environment Variables

**Option A: Export in Terminal (Temporary)**

```bash
export CLOUDFLARE_API_TOKEN=your_token_here
export CLOUDFLARE_ACCOUNT_ID=your_account_id_here
```

**Option B: Create `.env` File (Recommended)**

```bash
# Create .env file in your project directory
echo "CLOUDFLARE_API_TOKEN=your_token_here" > .env
echo "CLOUDFLARE_ACCOUNT_ID=your_account_id_here" >> .env
```

**Option C: Add to Shell Profile (Permanent)**

```bash
# Add to ~/.bashrc, ~/.zshrc, or equivalent
echo 'export CLOUDFLARE_API_TOKEN=your_token_here' >> ~/.bashrc
echo 'export CLOUDFLARE_ACCOUNT_ID=your_account_id_here' >> ~/.bashrc
source ~/.bashrc
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
--force                # Force delete aliased deployments (default: true)
--no-force             # Disable force mode for aliased deployments
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

- Verify token permissions include:
  - `Cloudflare Pages:Edit`
  - `Workers Scripts:Write`
- Check token hasn't expired
- Ensure token is for the correct account
- Try regenerating the token

**"Cannot delete an aliased deployment"**

```
Error: You cannot delete an aliased deployment without a `?force=true` parameter
```

- **Solution**: This is automatically handled! The tool uses `force=true` by default
- If you want to preserve aliased deployments, use `--no-force` flag
- Aliased deployments are special deployments linked to custom domains or branch aliases

**"Too Many Requests"**

- Tool has built-in rate limiting
- Reduce batch size: `--batch-size 5`

**"Account ID not found"**

- Double-check your Account ID from Cloudflare Dashboard
- Ensure you're using Account ID, not Zone ID
- Account ID format: 32-character hexadecimal string

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
