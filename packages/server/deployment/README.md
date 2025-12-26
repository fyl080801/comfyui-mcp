# ComfyUI-MCP Server Deployment

This directory contains all deployment configurations for the ComfyUI-MCP server.

## Directory Structure

```
deployment/
├── docker/              # Docker deployment files
│   ├── Dockerfile      # Multi-stage Dockerfile for monorepo
│   └── docker-compose.yml
└── kubernetes/          # Kubernetes deployment files
    ├── k8s-service.yaml    # Service, Deployment, HPA, PDB
    ├── ingress.yaml        # Ingress configuration
    └── argo-workflow.yaml  # Argo Workflow for CI/CD
```

## Docker Deployment

### Quick Start

From the monorepo root directory:

```bash
# Build and run with Docker Compose
docker-compose -f packages/server/deployment/docker/docker-compose.yml up -d

# Or build the image directly
docker build -f packages/server/deployment/docker/Dockerfile -t comfyui-mcp:latest .
```

### Docker Compose

The docker-compose.yml file is configured to:
- Build from the monorepo root context
- Use the Dockerfile in `packages/server/deployment/docker/`
- Mount configuration and workflows from the monorepo root
- Expose ports 8080 (MCP) and 3000 (Express API)

### Environment Variables

Configure these environment variables in docker-compose.yml or via `.env` file:

```bash
# ComfyUI Configuration
COMFYUI_ADDRESS=http://comfyui:8188

# S3 Configuration (optional)
S3_ENABLE=true
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1

# Job Configuration
JOB_MAX_JOB_AGE=86400000
JOB_MAX_JOBS=1000
JOB_CLEANUP_INTERVAL=3600000
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (v1.19+)
- kubectl configured
- Argo Workflows (for CI/CD)
- NGINX Ingress Controller (for ingress)
- Harbor registry (for image storage)

### Deploy to Kubernetes

```bash
# Apply the service, deployment, and config
kubectl apply -f packages/server/deployment/kubernetes/k8s-service.yaml

# Apply the ingress
kubectl apply -f packages/server/deployment/kubernetes/ingress.yaml

# Verify deployment
kubectl get pods -n dev -l app=comfyui-mcp
kubectl get svc -n dev comfyui-mcp
```

### Configuration

The Kubernetes deployment uses ConfigMaps for configuration:

1. **ConfigMap**: `comfyui-mcp-config` - Contains `config.json`
2. **ConfigMap**: `comfyui-mcp-workflows` - Contains workflow files

Update the ConfigMaps as needed:

```bash
kubectl create configmap comfyui-mcp-config \
  --from-file=config.json=config.example.json \
  --namespace=dev \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap comfyui-mcp-workflows \
  --from-file=workflows/ \
  --namespace=dev \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Argo Workflow

The Argo Workflow automates the build and deployment process:

```bash
# Submit the workflow
argo submit -n dev packages/server/deployment/kubernetes/argo-workflow.yaml \
  --parameter gitRevision=master \
  --parameter version=1.0.0

# List workflows
argo list -n dev

# Get workflow details
argo get -n dev <workflow-name>
```

#### Workflow Parameters

- `gitRepo`: Git repository URL (default: project repo)
- `gitRevision`: Git branch, tag, or commit SHA (default: master)
- `version`: Semantic version (default: 1.0.0)
- `commit`: Specific commit SHA (optional)
- `imageName`: Target image name (default: harbor-core.harbor.svc/ai-apps/comfyui-mcp)
- `harborAuthSecret`: Harbor auth secret (default: harbor-auth)
- `harborCaSecret`: Harbor CA certificate secret (default: harbor-ca-cert)
- `proxyConfigMap`: Proxy configuration ConfigMap (default: workflow-proxy-config)

## Production Considerations

### Resource Limits

The Kubernetes deployment includes these resource requests/limits:

```yaml
resources:
  limits:
    cpu: '1000m'
    memory: '1Gi'
  requests:
    cpu: '100m'
    memory: '128Mi'
```

Adjust based on your workload.

### Horizontal Pod Autoscaler

The deployment includes an HPA configuration:

```yaml
minReplicas: 1
maxReplicas: 10
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Health Checks

- **Liveness Probe**: Checks `/mcp` endpoint every 10s
- **Readiness Probe**: Checks `/mcp` endpoint every 5s

### Ingress Configuration

The ingress routes traffic based on path:

- `/mcp/*` → Port 8080 (MCP server)
- `/` → Port 3000 (Express API with Swagger UI)

Update the host in `ingress.yaml` before deploying.

## Security

### Secrets Management

Use Kubernetes secrets for sensitive data:

```yaml
env:
  - name: AWS_ACCESS_KEY_ID
    valueFrom:
      secretKeyRef:
        name: aws-credentials
        key: access-key-id
  - name: AWS_SECRET_ACCESS_KEY
    valueFrom:
      secretKeyRef:
        name: aws-credentials
        key: secret-access-key
```

### Image Pull Secrets

Configure image pull secrets for private registries:

```yaml
imagePullSecrets:
  - name: harbor-auth
```

## Monitoring

The deployment includes Prometheus annotations:

```yaml
annotations:
  prometheus.io/scrape: 'true'
  prometheus.io/port: '8080'
  prometheus.io/path: '/metrics'
```

Ensure Prometheus is configured to scrape these annotations.

## Troubleshooting

### Pod Not Starting

```bash
# Check pod status
kubectl describe pod -n dev <pod-name>

# Check logs
kubectl logs -n dev <pod-name>

# Check events
kubectl get events -n dev --sort-by='.lastTimestamp'
```

### Build Failures

Check the Argo Workflow logs:

```bash
# Get workflow logs
argo logs -n dev <workflow-name>

# Check specific step
argo logs -n dev <workflow-name> -f build-and-push
```

### Configuration Issues

Verify ConfigMaps are mounted correctly:

```bash
# Exec into pod
kubectl exec -it -n dev <pod-name> -- sh

# Check config file
cat /app/config.json

# Check workflows
ls -la /app/workflows/
```

## Additional Resources

- [Main README](../../../README.md)
- [CLAUDE.md](../../../CLAUDE.md) - Architecture documentation
- [Monorepo Migration Guide](../../../docs/MONOREPO_MIGRATION.md)
