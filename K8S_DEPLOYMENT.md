# Kubernetes Deployment Guide

This directory contains Kubernetes manifests for deploying ComfyUI-MCP to a Kubernetes cluster.

## Files

- [`ingress.yaml`](ingress.yaml) - Ingress configuration for routing external traffic
- [`k8s-service.yaml`](k8s-service.yaml) - Service, Deployment, ConfigMap, HPA, and PDB
- [`argo-workflow.yaml`](argo-workflow.yaml) - Argo Workflow for building and pushing images to Harbor

## Prerequisites

1. Kubernetes cluster with NGINX Ingress Controller installed
2. Harbor registry configured (or adjust image registry)
3. ComfyUI service accessible from the cluster
4. `kubectl` configured to access your cluster

## Quick Start

### 1. Update Configuration

Edit [`ingress.yaml`](ingress.yaml) and update the host:

```yaml
spec:
  rules:
    - host: comfyui-mcp.your-domain.com  # Change this
```

### 2. Create Namespace (if needed)

```bash
kubectl create namespace dev
```

### 3. Create Secrets

#### Harbor Registry Secret (if using Harbor)

```bash
kubectl create secret docker-registry harbor-auth \
  --docker-server=harbor-core.harbor.svc \
  --docker-username=<your-username> \
  --docker-password=<your-password> \
  -n dev
```

#### AWS S3 Credentials (optional)

```bash
kubectl create secret generic aws-credentials \
  --from-literal=access-key-id=<your-access-key> \
  --from-literal=secret-access-key=<your-secret-key> \
  -n dev
```

### 4. Deploy

```bash
# Deploy Service, Deployment, and ConfigMap
kubectl apply -f k8s-service.yaml

# Deploy Ingress
kubectl apply -f ingress.yaml
```

### 5. Verify Deployment

```bash
# Check pods
kubectl get pods -n dev -l app=comfyui-mcp

# Check service
kubectl get service comfyui-mcp -n dev

# Check ingress
kubectl get ingress comfyui-mcp-ingress -n dev

# View logs
kubectl logs -n dev -l app=comfyui-mcp --tail=100 -f
```

## Ingress Configuration

The Ingress is configured with the following routing:

| Path Pattern | Backend Service | Backend Port | Description |
|-------------|-----------------|--------------|-------------|
| `/mcp(/|$)(.*)` | comfyui-mcp | 8080 | FastMCP endpoint with rewrite |
| `/()(.*)` | comfyui-mcp | 8080 | Root path (all other requests) |

### Key Features

- **Path Rewriting**: Uses regex-based rewrite to strip `/mcp` prefix
- **CORS**: Enabled for cross-origin requests
- **Long timeouts**: 10-minute timeouts for long-running MCP jobs
- **WebSocket support**: Configured for potential future WebSocket features
- **Health checks**: Routes `/mcp` to health endpoint

### Annotations

```yaml
nginx.ingress.kubernetes.io/rewrite-target: /$2        # Strip prefix
nginx.ingress.kubernetes.io/use-regex: "true"          # Enable regex
nginx.ingress.kubernetes.io/proxy-read-timeout: "600"  # 10 min timeout
nginx.ingress.kubernetes.io/enable-cors: "true"        # CORS support
```

## Scaling

### Manual Scaling

```bash
kubectl scale deployment comfyui-mcp --replicas=3 -n dev
```

### Auto-Scaling

The HorizontalPodAutoscaler (HPA) is configured with:
- **Min replicas**: 1
- **Max replicas**: 10
- **Target CPU**: 70%
- **Target Memory**: 80%

```bash
# Check HPA status
kubectl get hpa comfyui-mcp-hpa -n dev
```

## Configuration Management

### Update ConfigMap

Edit the ConfigMap in [`k8s-service.yaml`](k8s-service.yaml) or use:

```bash
kubectl edit configmap comfyui-mcp-config -n dev
```

### Rollout Restart

After configuration changes:

```bash
kubectl rollout restart deployment comfyui-mcp -n dev
```

## TLS/HTTPS

Uncomment the TLS section in [`ingress.yaml`](ingress.yaml):

```yaml
spec:
  tls:
    - hosts:
        - comfyui-mcp.example.com
      secretName: comfyui-mcp-tls
```

Create the TLS secret:

```bash
kubectl create secret tls comfyui-mcp-tls \
  --cert=path/to/cert.crt \
  --key=path/to/cert.key \
  -n dev
```

## Monitoring

### Metrics

The deployment includes Prometheus annotations:

```yaml
prometheus.io/scrape: "true"
prometheus.io/port: "8080"
prometheus.io/path: "/metrics"
```

### Logs

```bash
# Follow logs
kubectl logs -n dev -l app=comfyui-mcp -f

# Logs from specific pod
kubectl logs -n dev comfyui-mcp-<pod-id> --tail=100 -f
```

### Port Forward (for local testing)

```bash
# Forward MCP port
kubectl port-forward -n dev svc/comfyui-mcp 8080:8080

# Forward Express port
kubectl port-forward -n dev svc/comfyui-mcp 3000:3000
```

## Argo Workflow Build

Use the provided [`argo-workflow.yaml`](argo-workflow.yaml) to build and push images:

```bash
# Submit workflow
argo submit argo-workflow.yaml \
  --parameter gitRevision=master \
  --parameter version=1.0.0 \
  -n dev

# List workflows
argo list -n dev

# Get workflow logs
argo logs <workflow-name> -n dev
```

## Troubleshooting

### Pod Not Starting

```bash
# Describe pod for events
kubectl describe pod -n dev -l app=comfyui-mcp

# Check pod logs
kubectl logs -n dev -l app=comfyui-mcp --previous
```

### Ingress Not Working

```bash
# Check ingress controller logs
kubectl logs -n ingress-nginx <ingress-controller-pod>

# Test ingress locally
kubectl port-forward -n dev svc/comfyui-mcp 8080:8080
curl http://localhost:8080/mcp
```

### Connection to ComfyUI

Ensure ComfyUI is accessible:

```bash
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n dev -- \
  curl http://comfyui:8188/system_stats
```

## Resource Requirements

Default resources (adjust in [`k8s-service.yaml`](k8s-service.yaml)):

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 100m | 1000m |
| Memory | 128Mi | 1Gi |

## High Availability

The PodDisruptionBudget ensures:
- **Minimum available**: 1 pod during voluntary disruptions

This allows node maintenance while keeping the service available.

## Cleanup

```bash
# Delete all resources
kubectl delete -f ingress.yaml
kubectl delete -f k8s-service.yaml

# Or delete by label
kubectl delete all -l app=comfyui-mcp -n dev
```

## Production Considerations

1. **Image Pull Secrets**: Ensure registry credentials are properly configured
2. **Resource Limits**: Adjust based on actual usage patterns
3. **Health Checks**: Tune probe intervals based on startup time
4. **TLS**: Always use TLS in production
5. **Backup ConfigMaps**: Version control your ConfigMaps
6. **Monitoring**: Integrate with your monitoring system (Prometheus, Grafana)
7. **Log Aggregation**: Send logs to centralized logging (ELK, Loki, etc.)
8. **Secrets Management**: Use external secret managers (Vault, Sealed Secrets)
