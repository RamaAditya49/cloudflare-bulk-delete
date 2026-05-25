# Cloudflare Bulk Delete for VS Code

Run Cloudflare Pages cleanup directly from the VS Code Command Palette.

## Commands

- `Cloudflare Bulk Delete: Configure Credentials`
- `Cloudflare Bulk Delete: List Resources`
- `Cloudflare Bulk Delete: Preview Pages Cleanup`
- `Cloudflare Bulk Delete: Delete Pages Deployments`

The extension stores the Cloudflare API token in VS Code Secret Storage. It does not publish to npm or the VS Code Marketplace automatically.

## Manual Packaging

From the repository root:

```bash
npm run vscode:package
```

Publish the generated `.vsix` manually with your Marketplace publisher account when ready.
