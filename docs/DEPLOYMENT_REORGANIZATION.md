# Deployment Files Reorganization

This document describes the reorganization of deployment files into the server package structure.

## Changes Made

### Before
```
comfyui-mcp/
├── Dockerfile
├── docker-compose.yml
├── k8s-service.yaml
├── ingress.yaml
└── argo-workflow.yaml
```

### After
```
comfyui-mcp/
├── packages/server/deployment/
│   ├── README.md                   # Deployment documentation
│   ├── docker/
│   │   ├── Dockerfile             # Multi-stage Dockerfile
│   │   └── docker-compose.yml     # Docker Compose config
│   └── kubernetes/
│       ├── k8s-service.yaml       # Service, Deployment, HPA, PDB
│       ├── ingress.yaml           # Ingress configuration
│       └── argo-workflow.yaml     # Argo Workflow for CI/CD
├── Makefile                        # Convenience commands
└── README.md                       # Updated with new paths
```

## Benefits

1. **Better Organization**: All deployment files are now co-located with the server package
2. **Clear Separation**: Deployment configs are separate from source code
3. **Scalability**: Easy to add deployment configs for future packages
4. **Documentation**: Each deployment type has its own README section

## Usage

### Using Make (Recommended)

From the monorepo root:

```bash
# Build Docker image
make docker-build

# Start with docker-compose
make docker-up

# Deploy to Kubernetes
make deploy-k8

# Submit Argo Workflow
make deploy-argo VERSION=1.0.0

# View all commands
make help
```

### Direct Commands

**Docker:**
```bash
# Build
docker build -f packages/server/deployment/docker/Dockerfile -t comfyui-mcp .

# Run with docker-compose
docker-compose -f packages/server/deployment/docker/docker-compose.yml up -d
```

**Kubernetes:**
```bash
# Apply manifests
kubectl apply -f packages/server/deployment/kubernetes/k8s-service.yaml
kubectl apply -f packages/server/deployment/kubernetes/ingress.yaml

# Submit Argo Workflow
argo submit -n dev packages/server/deployment/kubernetes/argo-workflow.yaml \
  --parameter version=1.0.0
```

## File Changes

### Docker Compose

Updated paths to build from monorepo root:
```yaml
build:
  context: ../../../  # Monorepo root
  dockerfile: packages/server/deployment/docker/Dockerfile
```

Volume mounts updated to use relative paths from monorepo root:
```yaml
volumes:
  - ../../../config.example.json:/app/config.json:ro
  - ../../../workflows:/app/workflows:ro
```

### Dockerfile

No changes needed - already configured to build from monorepo root.

### Kubernetes Files

No changes to the manifests themselves, just moved to new location.

### Argo Workflow

Updated description to mention monorepo structure.

## Documentation Updates

- **README.md**: Updated Docker and Kubernetes sections with new paths
- **CLAUDE.md**: Updated deployment documentation
- **packages/server/deployment/README.md**: Comprehensive deployment guide

## Migration Notes

If you have existing scripts or CI/CD pipelines that reference the old file locations:

1. Update file paths to new locations under `packages/server/deployment/`
2. Or use the Makefile commands which abstract the paths
3. Update Argo Workflow if it uses a different repository structure

Example migration:

```bash
# Before
docker build -t comfyui-mcp .
kubectl apply -f k8s-service.yaml

# After
docker build -f packages/server/deployment/docker/Dockerfile -t comfyui-mcp .
kubectl apply -f packages/server/deployment/kubernetes/k8s-service.yaml

# Or use Make
make docker-build
make deploy-k8
```

## Backward Compatibility

To maintain backward compatibility, symbolic links could be created in the root directory:

```bash
# Optional: Create symlinks (if needed)
ln -s packages/server/deployment/docker/Dockerfile Dockerfile
ln -s packages/server/deployment/docker/docker-compose.yml docker-compose.yml
ln -s packages/server/deployment/kubernetes/k8s-service.yaml k8s-service.yaml
ln -s packages/server/deployment/kubernetes/ingress.yaml ingress.yaml
ln -s packages/server/deployment/kubernetes/argo-workflow.yaml argo-workflow.yaml
```

However, using the Makefile is recommended for better maintainability.

## Troubleshooting

### Build Context Issues

If Docker build fails with context errors, ensure you're building from the monorepo root:

```bash
# Correct
docker build -f packages/server/deployment/docker/Dockerfile -t comfyui-mcp .

# Wrong (will fail)
cd packages/server && docker build -f deployment/docker/Dockerfile -t comfyui-mcp .
```

### Path Issues in Docker Compose

The docker-compose.yml uses relative paths from its own location. If you move it, update the paths:

```yaml
context: ../../../  # Should point to monorepo root
```

### Kubernetes Manifest Not Found

Use absolute paths or run from monorepo root:

```bash
# From monorepo root
kubectl apply -f packages/server/deployment/kubernetes/k8s-service.yaml

# Or use Make
make deploy-k8
```

## Future Enhancements

Possible additions to the deployment structure:

1. **Helm Charts**: Add `packages/server/deployment/helm/` directory
2. **Terraform**: Add `packages/server/deployment/terraform/` directory
3. **CI/CD Pipelines**: Add `.github/workflows/` or similar
4. **Monitoring**: Add Prometheus/Grafana configs
5. **Multiple Environments**: dev, staging, prod subdirectories

## Related Documentation

- [Main README](../README.md)
- [CLAUDE.md](../CLAUDE.md) - Architecture documentation
- [Monorepo Migration Guide](./MONOREPO_MIGRATION.md)
- [Deployment README](../packages/server/deployment/README.md)
