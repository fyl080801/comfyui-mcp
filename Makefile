.PHONY: help dev build start clean docker-build docker-up docker-down deploy-k8

# Default target
help:
	@echo "ComfyUI-MCP Monorepo Makefile"
	@echo ""
	@echo "Development:"
	@echo "  make dev         - Start development server"
	@echo "  make build       - Build all packages"
	@echo "  make start       - Start production server"
	@echo "  make clean       - Clean build artifacts"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build - Build Docker image"
	@echo "  make docker-up    - Start with docker-compose"
	@echo "  make docker-down  - Stop docker-compose"
	@echo ""
	@echo "Kubernetes:"
	@echo "  make deploy-k8    - Deploy to Kubernetes"
	@echo "  make deploy-argo  - Submit Argo Workflow"
	@echo ""
	@echo "Documentation:"
	@echo "  make docs        - Open deployment documentation"

# Development
dev:
	pnpm dev

# Build all packages
build:
	pnpm build

# Start production server
start:
	pnpm start

# Clean build artifacts
clean:
	pnpm clean

# Docker build
docker-build:
	docker build -f packages/server/deployment/docker/Dockerfile -t comfyui-mcp:latest .

# Docker compose up
docker-up:
	docker-compose -f packages/server/deployment/docker/docker-compose.yml up -d

# Docker compose down
docker-down:
	docker-compose -f packages/server/deployment/docker/docker-compose.yml down

# Deploy to Kubernetes
deploy-k8:
	kubectl apply -f packages/server/deployment/kubernetes/k8s-service.yaml
	kubectl apply -f packages/server/deployment/kubernetes/ingress.yaml
	@echo "Deployment submitted to Kubernetes"
	@echo "Check status with: kubectl get pods -n dev -l app=comfyui-mcp"

# Submit Argo Workflow
deploy-argo:
	@echo "Submitting Argo Workflow..."
	argo submit -n dev packages/server/deployment/kubernetes/argo-workflow.yaml \
		--parameter gitRevision=${REVISION:-master} \
		--parameter version=${VERSION:-1.0.0}

# Open deployment docs
docs:
	@echo "Opening deployment documentation..."
	@echo "File: packages/server/deployment/README.md"
	@cat packages/server/deployment/README.md
