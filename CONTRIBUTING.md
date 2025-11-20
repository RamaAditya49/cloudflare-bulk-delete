# Contributing to Cloudflare Bulk Delete

Thank you for your interest in contributing to the Cloudflare Bulk Delete project! This guide will help you understand our development process, coding standards, and how to submit your contributions effectively.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Documentation](#documentation)
- [Release Process](#release-process)
- [Community Guidelines](#community-guidelines)

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- **Node.js** (v18.0.0 or higher)
- **npm** (v8.0.0 or higher)
- **Git** (latest version recommended)
- **Cloudflare account** with API token for testing (optional but recommended)

### Development Environment

We recommend using:

- **VS Code** with recommended extensions (see `.vscode/extensions.json`)
- **ESLint** and **Prettier** for code formatting
- **Jest** for testing (configured for ESM modules)

## Development Setup

1. **Fork the repository**

   ```bash
   git clone https://github.com/your-username/cloudflare-bulk-delete.git
   cd cloudflare-bulk-delete
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Copy environment configuration**

   ```bash
   cp examples/configuration/.env.example .env
   # Edit .env with your Cloudflare credentials (for testing)
   ```

4. **Run tests to verify setup**

   ```bash
   npm test
   npm run test:coverage
   ```

5. **Verify the CLI works**
   ```bash
   npm run build
   ./bin/cloudflare-bulk-delete.js --version
   ```

### Development Scripts

```bash
# Development and Testing
npm run dev                 # Run in development mode
npm run test               # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage report
npm run test:ci            # Run tests for CI (no watch, coverage)

# Code Quality
npm run lint               # Run ESLint
npm run lint:fix           # Fix ESLint issues automatically
npm run format             # Format code with Prettier

# Build and Release
npm run build              # Build the project
npm run prepublish         # Prepare for npm publish

# Examples
npm run example:basic      # Run basic cleanup example
npm run example:advanced   # Run advanced cleanup example
```

## Project Structure

```
cloudflare-bulk-delete/
├── src/                   # Source code
│   ├── lib/              # Core library modules
│   │   ├── cloudflare-client.js    # Base API client
│   │   ├── pages-client.js         # Pages-specific client
│   │   ├── workers-client.js       # Workers-specific client
│   │   └── service-manager.js      # Main service orchestrator
│   ├── utils/            # Utility functions
│   │   ├── logger.js     # Logging utilities
│   │   ├── rate-limiter.js # API rate limiting
│   │   └── validators.js  # Input validation
│   └── index.js          # Main export file
├── bin/                  # CLI executables
├── __tests__/            # Test files
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   └── fixtures/        # Test data and mocks
├── examples/            # Usage examples
│   ├── basic/          # Simple examples
│   ├── advanced/       # Complex scenarios
│   ├── programmatic/   # Library usage examples
│   └── configuration/ # Config templates
├── docs/               # Additional documentation
└── .github/            # GitHub workflows and templates
```

## Coding Standards

### JavaScript/Node.js Standards

We follow modern JavaScript best practices with ESM modules:

```javascript
// ✅ Good - ESM imports
import { ServiceManager } from './lib/service-manager.js';
import { logger } from './utils/logger.js';

// ❌ Bad - CommonJS (not used in this project)
const ServiceManager = require('./lib/service-manager');

// ✅ Good - Clear, descriptive names
async function validateCloudflareConnection(apiToken, accountId) {
  // Implementation
}

// ❌ Bad - Unclear names
async function validate(token, id) {
  // Implementation
}

// ✅ Good - Proper error handling
try {
  const result = await apiCall();
  return { success: true, data: result };
} catch (error) {
  logger.error('API call failed', { error: error.message });
  throw new Error(`Operation failed: ${error.message}`);
}

// ✅ Good - JSDoc documentation for public APIs
/**
 * Delete multiple deployments with safety checks
 * @param {string} projectName - Cloudflare Pages project name
 * @param {Array} deployments - Array of deployment objects to delete
 * @param {Object} options - Configuration options
 * @param {boolean} options.dryRun - Preview changes without executing
 * @returns {Promise<{success: number, failed: number}>} Deletion results
 */
async function bulkDeleteDeployments(projectName, deployments, options = {}) {
  // Implementation
}
```

### Code Style Guidelines

- **ES6+ Features**: Use modern JavaScript features (async/await, destructuring, etc.)
- **Modular Design**: Keep functions small and focused on single responsibilities
- **Error Handling**: Always handle errors gracefully with meaningful messages
- **Logging**: Use structured logging with appropriate levels (debug, info, warn, error)
- **Documentation**: Document public APIs with JSDoc, add inline comments for complex logic

### File Organization

- **One class per file** for major components
- **Group related utilities** in dedicated files
- **Separate concerns** (API clients, business logic, utilities)
- **Use descriptive filenames** that reflect the module's purpose

### Environment and Configuration

- **Environment Variables**: Use `.env` files for configuration
- **Default Values**: Provide sensible defaults for all configuration options
- **Validation**: Validate all inputs and configuration values
- **Security**: Never commit API keys or sensitive data

## Testing Guidelines

### Test Structure

We use Jest with ESM support for all testing:

```javascript
// ✅ Good test structure
describe('ServiceManager', () => {
  describe('bulkDeleteDeployments', () => {
    let serviceManager;

    beforeEach(() => {
      serviceManager = new ServiceManager('test-token', 'test-account');
    });

    it('should successfully delete multiple deployments', async () => {
      // Arrange
      const deployments = [{ id: 'deploy1' }, { id: 'deploy2' }];
      const mockApiResponse = { success: true };

      // Mock API calls
      jest.spyOn(serviceManager.pagesClient, 'deleteDeployment').mockResolvedValue(mockApiResponse);

      // Act
      const result = await serviceManager.bulkDeleteDeployments(
        'pages',
        'test-project',
        deployments
      );

      // Assert
      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should handle partial failures gracefully', async () => {
      // Test error scenarios
    });
  });
});
```

### Testing Requirements

- **Unit Tests**: Cover all public methods and edge cases
- **Integration Tests**: Test complete workflows with mocked external APIs
- **Error Testing**: Verify error handling and recovery mechanisms
- **Mock External Dependencies**: Never make real API calls in tests
- **Test Coverage**: Maintain minimum 75% code coverage (target: 85%+)

### Test Categories

1. **Unit Tests** (`__tests__/unit/`)
   - Test individual functions and classes
   - Mock all external dependencies
   - Focus on business logic and edge cases

2. **Integration Tests** (`__tests__/integration/`)
   - Test complete workflows
   - Use realistic mock data
   - Verify component interactions

3. **Example Tests** (in example files)
   - Ensure examples work correctly
   - Test with various configurations
   - Validate documentation accuracy

### Running Tests

```bash
# Run all tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --testNamePattern="ServiceManager"

# Run tests in watch mode during development
npm run test:watch

# Generate detailed coverage report
npm run test:coverage -- --coverage --coverageReporters=html
```

## Pull Request Process

### Before Submitting

1. **Create an Issue**: For new features or significant changes, create an issue first to discuss the approach

2. **Branch Strategy**:

   ```bash
   # Create feature branch from main
   git checkout -b feature/your-feature-name

   # Or for bug fixes
   git checkout -b fix/issue-description
   ```

3. **Code Quality Checks**:
   ```bash
   npm run lint              # Check for linting issues
   npm run test:coverage     # Ensure tests pass and coverage is maintained
   npm run build             # Verify build succeeds
   ```

### Pull Request Template

When submitting a PR, include:

**Description**

- Clear summary of changes
- Reference related issues (`Fixes #123`)
- Screenshots for UI changes

**Type of Change**

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

**Testing**

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Test coverage maintained/improved
- [ ] Manual testing completed

**Checklist**

- [ ] Code follows project coding standards
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No console.log or debug statements left

### Review Process

1. **Automated Checks**: All PRs must pass CI/CD checks
2. **Code Review**: At least one maintainer review required
3. **Testing**: Verify tests pass and coverage is maintained
4. **Documentation**: Ensure changes are properly documented

### Merging

- **Squash and Merge**: For feature branches with multiple commits
- **Regular Merge**: For well-organized commit history
- **Delete Branch**: After successful merge

## Commit Message Guidelines

### Conventional Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated versioning and changelog generation. All commits must follow this format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Commit Types

- **feat**: New feature (triggers MINOR version bump)
- **fix**: Bug fix (triggers PATCH version bump)
- **docs**: Documentation changes only
- **style**: Code style changes (formatting, missing semicolons, etc.)
- **refactor**: Code refactoring without feature changes
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Maintenance tasks, dependency updates
- **ci**: CI/CD configuration changes
- **build**: Build system changes
- **revert**: Reverting a previous commit

### Breaking Changes

For breaking changes, add `BREAKING CHANGE:` in the footer or `!` after the type:

```bash
feat!: remove support for Node 14

BREAKING CHANGE: Node 14 is no longer supported. Minimum version is now Node 16.
```

This triggers a MAJOR version bump.

### Commit Examples

```bash
# Feature addition (1.0.0 → 1.1.0)
feat: add force parameter for aliased deployments

# Bug fix (1.0.0 → 1.0.1)
fix: resolve token validation error

# Documentation update (no version bump)
docs: update README with detailed setup guide

# Breaking change (1.0.0 → 2.0.0)
feat!: change API response format

BREAKING CHANGE: API now returns { data, meta } instead of flat response

# With scope
feat(pages): add deployment filtering by environment
fix(cli): correct help text for --force flag
```

### Commit Message Template

A commit message template is configured automatically. When you commit, you'll see:

```bash
git commit
# Opens editor with template:
# <type>(<scope>): <subject>
# |<----  Using a Maximum Of 50 Characters  ---->|
# ...
```

### Automated Releases

When you push to `main`:

1. **semantic-release** analyzes commit messages
2. **Version** is automatically bumped based on commit types
3. **CHANGELOG.md** is updated automatically
4. **GitHub release** is created with release notes
5. **npm package** is published automatically

**No manual version bumping required!**

### Commit Validation

Commits are validated using commitlint:

```bash
# ✅ Valid commits
git commit -m "feat: add new feature"
git commit -m "fix: resolve bug"
git commit -m "docs: update README"

# ❌ Invalid commits (will be rejected)
git commit -m "Added new feature"  # Missing type
git commit -m "FIX: bug"           # Type must be lowercase
git commit -m "feat: Fix."         # Subject ends with period
```

## Issue Reporting

### Bug Reports

When reporting bugs, include:

```markdown
## Bug Description

Clear description of the issue

## Steps to Reproduce

1. Step one
2. Step two
3. Step three

## Expected Behavior

What should have happened

## Actual Behavior

What actually happened

## Environment

- Node.js version:
- npm version:
- OS:
- Tool version:

## Additional Context

- Log output
- Configuration details
- Screenshots (if applicable)
```

### Feature Requests

For new features:

```markdown
## Feature Description

Clear description of the requested feature

## Use Case

Why is this feature needed? What problem does it solve?

## Proposed Solution

How should this feature work?

## Alternatives Considered

Any alternative approaches considered?

## Additional Context

Any other relevant information
```

## Documentation

### README Updates

Keep the main README.md current with:

- Installation instructions
- Basic usage examples
- Configuration options
- Troubleshooting guide

### Code Documentation

- **JSDoc**: Document all public APIs
- **Inline Comments**: Explain complex logic
- **Examples**: Provide working code examples
- **Changelog**: Update CHANGELOG.md for releases

### Example Maintenance

- **Working Examples**: Ensure all examples in `/examples` directory work
- **Documentation**: Keep example documentation current
- **Test Coverage**: Examples should include basic tests

## Release Process

### Automated Releases with semantic-release

This project uses **semantic-release** for fully automated releases. You don't need to manually bump versions or create releases.

### How It Works

1. **Commit with Conventional Format**: Use conventional commit messages
2. **Push to Main**: Merge your PR to main branch
3. **Automatic Release**: semantic-release handles everything:
   - Analyzes commits since last release
   - Determines next version number
   - Updates `package.json` and `package-lock.json`
   - Generates/updates `CHANGELOG.md`
   - Creates GitHub release with notes
   - Publishes to npm
   - Creates git tag

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes (`feat!:` or `BREAKING CHANGE:`)
- **MINOR** (1.0.0 → 1.1.0): New features (`feat:`)
- **PATCH** (1.0.0 → 1.0.1): Bug fixes (`fix:`)

### Manual Release (Emergency Only)

If automated release fails, maintainers can manually release:

```bash
# Run semantic-release locally
npx semantic-release --no-ci
```

### Release Checklist

Before merging to main:

- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Commit messages follow conventional format
- [ ] Documentation updated if needed
- [ ] Breaking changes clearly documented

## Community Guidelines

### Code of Conduct

- **Be Respectful**: Treat all community members with respect
- **Be Inclusive**: Welcome newcomers and diverse perspectives
- **Be Collaborative**: Work together to improve the project
- **Be Patient**: Help others learn and grow

### Communication

- **Issues**: For bug reports and feature requests
- **Discussions**: For questions and community conversations
- **Pull Requests**: For code contributions
- **Email**: For security issues or sensitive topics

### Recognition

Contributors will be recognized in:

- README.md contributors section
- Release notes for significant contributions
- GitHub contributor statistics

## Getting Help

If you need help:

1. **Check Documentation**: README.md and examples
2. **Search Issues**: Look for similar problems/solutions
3. **Create Discussion**: For questions and help requests
4. **Join Community**: Connect with other contributors

### Maintainer Contact

For urgent issues or maintainer-specific questions:

- Create a GitHub issue with `@maintainer` mention
- Email: [maintainer-email] for security issues

---

## Quick Start for Contributors

```bash
# 1. Fork and clone
git clone https://github.com/your-username/cloudflare-bulk-delete.git
cd cloudflare-bulk-delete

# 2. Setup development environment
npm install
cp examples/configuration/.env.example .env

# 3. Run tests to verify setup
npm run test:coverage

# 4. Create feature branch
git checkout -b feature/your-feature

# 5. Make changes and test
npm run lint
npm run test:coverage

# 6. Commit and push
git add .
git commit -m "feat: add your feature description"
git push origin feature/your-feature

# 7. Create pull request on GitHub
```

Thank you for contributing to Cloudflare Bulk Delete! 🚀

---

**Questions?** Feel free to open an issue or start a discussion. We're here to help!
