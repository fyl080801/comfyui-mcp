# Monorepo Migration Guide

This document outlines the changes made to convert ComfyUI-MCP from a single-package project to a **pnpm workspace monorepo**.

## What Changed?

### Project Structure

**Before:**
```
comfyui-mcp/
├── src/              # All source code
├── package.json
├── tsconfig.json
├── Dockerfile
└── docker-compose.yml
```

**After:**
```
comfyui-mcp/
├── packages/
│   ├── shared/       # Shared types and utilities
│   └── server/       # MCP server implementation
├── pnpm-workspace.yaml
├── package.json      # Root workspace package
├── tsconfig.json     # Project references
├── Dockerfile        # Updated for monorepo
└── docker-compose.yml
```

### Package Manager Changed

- **Before**: npm
- **After**: pnpm (required for workspace support)

### New Packages

1. **@comfyui-mcp/shared** (`packages/shared/`)
   - Contains all shared TypeScript types
   - Common utility functions
   - Configuration type definitions
   - No dependencies on other workspace packages

2. **@comfyui-mcp/server** (`packages/server/`)
   - The original MCP server implementation
   - Depends on `@comfyui-mcp/shared`
   - All source code moved from `src/` to `packages/server/src/`

## Migration Steps for Existing Users

### 1. Install pnpm

If you don't have pnpm installed:

```bash
npm install -g pnpm@9.15.0
```

### 2. Reinstall Dependencies

```bash
# Remove old npm modules
rm -rf node_modules package-lock.json

# Install with pnpm
pnpm install
```

### 3. Update Development Commands

**Before:**
```bash
npm run dev
npm run build
npm start
```

**After:**
```bash
pnpm dev          # Start dev server
pnpm build        # Build all packages
pnpm start        # Start production server
```

### 4. Update Docker Builds

The Dockerfile has been updated to handle monorepo builds. No changes needed to your build commands:

```bash
docker build -t comfyui-mcp .
```

### 5. Update Import Paths (For Custom Code)

If you have custom code that imports from this project, update the import paths:

**Before:**
```typescript
import { JobStatus } from './job/types.js'
```

**After:**
```typescript
import { JobStatus } from '@comfyui-mcp/shared/types'
```

## Benefits of the Monorepo Structure

### 1. Code Sharing
Common types and utilities are now in a dedicated package that can be shared across multiple packages.

### 2. Better Dependency Management
- pnpm workspaces provide efficient dependency handling
- Shared dependencies are deduplicated across packages
- Faster installation times

### 3. Clear Separation of Concerns
- **shared**: Pure types and utilities with no runtime dependencies
- **server**: Business logic and MCP implementation

### 4. Future Extensibility
Easy to add new packages:
- `@comfyui-mcp/client` - Client SDK
- `@comfyui-mcp/cli` - Command-line interface
- `@comfyui-mcp/admin` - Admin dashboard

## Development Workflow

### Building All Packages

```bash
pnpm build
```

This builds packages in dependency order:
1. `@comfyui-mcp/shared`
2. `@comfyui-mcp/server`

### Building Specific Package

```bash
pnpm build:shared
pnpm build:server
```

### Development Mode

```bash
pnpm dev
```

Runs the server in development mode with hot reload.

### Clean Build Artifacts

```bash
pnpm clean
```

Removes all `dist/` directories across the monorepo.

## Troubleshooting

### Issue: "Cannot find module '@comfyui-mcp/shared'"

**Solution**: Make sure you've run `pnpm install` and `pnpm build` at least once.

### Issue: Docker build fails

**Solution**: Ensure the Dockerfile includes pnpm installation. The updated Dockerfile handles this automatically.

### Issue: Type errors in server code

**Solution**: Run `pnpm build:shared` first to build the shared package, as the server depends on it.

## Argo Workflow & Kubernetes

No changes required to your existing Argo Workflow or Kubernetes configurations. The Dockerfile has been updated to maintain compatibility while building the monorepo structure.

## Need Help?

If you encounter any issues during migration:

1. Check [CLAUDE.md](../CLAUDE.md) for detailed architecture documentation
2. Review the updated [README.md](../README.md) for usage examples
3. Open an issue on GitHub with details about your problem
