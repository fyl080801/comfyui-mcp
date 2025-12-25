# Configuration System Documentation

## Overview

The ComfyUI MCP server uses a unified configuration system with clear priority levels for all settings. Configuration values are loaded from multiple sources with the following priority (highest to lowest):

1. **Environment Variables** - Override all other settings
2. **config.json** - Default configuration file
3. **Default Values** - Fallback values defined in code

## Quick Start

1. Copy the example configuration:
   ```bash
   cp config.example.json config.json
   ```

2. (Optional) Create environment file:
   ```bash
   cp .env.example .env
   ```

3. Edit `config.json` with your ComfyUI settings

4. For production, use environment variables to override sensitive values

## Configuration Files

### config.json

Main configuration file located at project root.

```json
{
  "comfyui": {
    "address": "http://127.0.0.1:8188",
    "client_id": "comfyui-mcp-client"
  },
  "s3": {
    "bucket": "your-s3-bucket-name",
    "region": "us-east-1",
    "endpoint": "",
    "public_domain": "",
    "enable_path_style": false
  },
  "services": [...]
}
```

### .env

Optional environment variables file (loaded automatically via dotenv).

```bash
COMFYUI_ADDRESS=http://127.0.0.1:8188
S3_ENABLE=false
S3_BUCKET=my-bucket
# ...
```

## Environment Variables

### ComfyUI Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `COMFYUI_ADDRESS` | ComfyUI server URL | `http://127.0.0.1:8188` |
| `COMFYUI_CLIENT_ID` | Client identifier | `comfyui-mcp-client` |

### S3 Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `S3_ENABLE` | Enable S3 uploads | `false` |
| `AWS_ACCESS_KEY_ID` | AWS access key | - |
| `S3_ACCESS_KEY_ID` | S3 access key (higher priority) | - |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | - |
| `S3_SECRET_ACCESS_KEY` | S3 secret key (higher priority) | - |
| `S3_BUCKET` | S3 bucket name | From config.json |
| `S3_REGION` | AWS region | `us-east-1` |
| `S3_ENDPOINT` | Custom S3 endpoint | - |
| `S3_PUBLIC_DOMAIN` | Custom public domain | Auto-generated |
| `S3_ENABLE_PATH_STYLE` | Use path-style addressing | `false` |

## Configuration API

### Get Full Configuration

```typescript
import { getConfig } from './config/index.js';

const config = getConfig();
console.log(config.comfyui.host);
console.log(config.s3.enabled);
```

### Get Specific Sections

```typescript
import { getComfyUIConfig, getS3Config, getServices } from './config/index.js';

const comfyui = getComfyUIConfig();
const s3 = getS3Config();
const services = getServices();
```

### Get Service by Name

```typescript
import { getServiceByName } from './config/index.js';

const service = getServiceByName('text_to_image');
```

### Load Workflow

```typescript
import { loadWorkflow } from './config/index.js';

const workflow = loadWorkflow('workflow_api.json');
```

## Configuration Priority Examples

### Example 1: Using Environment Variables

```bash
# .env file
COMFYUI_ADDRESS=https://comfyui.example.com
S3_ENABLE=true
S3_BUCKET=production-bucket
```

Result:
- ComfyUI address: `https://comfyui.example.com` (from env)
- S3 enabled: `true` (from env)
- S3 bucket: `production-bucket` (from env)

### Example 2: Mixed Configuration

```bash
# .env file
S3_ENABLE=true
```

```json
// config.json
{
  "s3": {
    "bucket": "my-bucket",
    "region": "us-west-2"
  }
}
```

Result:
- S3 enabled: `true` (from env)
- S3 bucket: `my-bucket` (from config.json)
- S3 region: `us-west-2` (from config.json)

## Validation

All configuration is validated using Zod schemas. Invalid configurations will throw descriptive errors at startup:

```typescript
Error: Configuration validation failed:
  - comfyui.address: Invalid url
  - s3.bucket: Required
```

## Best Practices

1. **Development**: Use `config.json` for local settings
2. **Production**: Use environment variables for sensitive values
3. **CI/CD**: Use environment variables for environment-specific settings
4. **Docker**: Pass environment variables via `-e` flags or `--env-file`

## Migration from Old System

The old system used separate `config.ts` and `envs.ts` files. The new unified system:

- **Before**: `import { COMFYUI_HOST } from './envs.js'`
- **After**: `import { getComfyUIConfig } from './config/index.js'`

See the updated files in [src/comfyui/](src/comfyui/) for examples.
