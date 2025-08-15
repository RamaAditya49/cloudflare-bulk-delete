# Cloudflare Bulk Delete - Usage Examples

This directory contains comprehensive examples demonstrating various use cases for the Cloudflare Bulk Delete tool.

## 📁 Directory Structure

```
examples/
├── README.md                     # This file
├── basic/                        # Basic usage examples
│   ├── pages-cleanup.js          # Simple Pages deployment cleanup
│   └── workers-cleanup.js        # Simple Workers version cleanup
├── advanced/                     # Advanced workflow examples
│   ├── bulk-preview-cleanup.js   # Clean up old preview deployments
│   ├── production-safety.js      # Production environment safety checks
│   └── scheduled-cleanup.js      # Automated scheduled cleanup
├── programmatic/                 # Library usage examples
│   ├── custom-integration.js     # Custom application integration
│   ├── batch-processing.js       # Process multiple projects/scripts
│   └── monitoring-cleanup.js     # Cleanup with monitoring/alerting
└── configuration/                # Configuration examples
    ├── .env.example              # Environment variables template
    ├── config-examples.js        # Configuration options
    └── safety-profiles.js        # Different safety configuration profiles
```

## 🚀 Quick Start

1. **Copy environment variables**:
   ```bash
   cp examples/configuration/.env.example .env
   ```

2. **Configure your credentials** in `.env`:
   ```bash
   CLOUDFLARE_API_TOKEN=your_token_here
   CLOUDFLARE_ACCOUNT_ID=your_account_id_here
   ```

3. **Run an example**:
   ```bash
   node examples/basic/pages-cleanup.js
   ```

## 📚 Examples by Use Case

### Basic Operations
- **[pages-cleanup.js](./basic/pages-cleanup.js)** - Delete old Pages deployments
- **[workers-cleanup.js](./basic/workers-cleanup.js)** - Clean up Workers versions

### Advanced Workflows
- **[bulk-preview-cleanup.js](./advanced/bulk-preview-cleanup.js)** - Bulk cleanup of preview environments
- **[production-safety.js](./advanced/production-safety.js)** - Safe production cleanup with validation
- **[scheduled-cleanup.js](./advanced/scheduled-cleanup.js)** - Automated cleanup schedules

### Programmatic Usage
- **[custom-integration.js](./programmatic/custom-integration.js)** - Integration with existing applications
- **[batch-processing.js](./programmatic/batch-processing.js)** - Process multiple resources efficiently
- **[monitoring-cleanup.js](./programmatic/monitoring-cleanup.js)** - Cleanup with monitoring and alerts

## ⚠️ Safety Guidelines

All examples include comprehensive safety measures:

- **Dry run mode** by default
- **Production protection** with explicit confirmation
- **Backup recommendations** before destructive operations
- **Rate limiting** to respect API limits
- **Error handling** with detailed logging

## 🔧 Configuration

Examples use environment variables for configuration. See [`configuration/.env.example`](./configuration/.env.example) for all available options.

## 📖 Documentation

For detailed documentation, see:
- [Main README](../README.md) - Project overview
- [API Documentation](../docs/API.md) - Programmatic usage
- [CLI Documentation](../docs/CLI.md) - Command line usage
- [Contributing Guide](../CONTRIBUTING.md) - Development setup

## 💡 Need Help?

- Check the [FAQ](../docs/FAQ.md) for common questions
- Review [troubleshooting guide](../docs/TROUBLESHOOTING.md) for issues
- Open an [issue](https://github.com/RamaAditya49/cloudflare-bulk-delete/issues) for bugs or feature requests

---

**⚠️ Important**: Always test examples in a development environment first. Review and understand each script before running in production.