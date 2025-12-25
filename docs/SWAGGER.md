# Swagger API Documentation

The ComfyUI-MCP server includes interactive API documentation powered by Swagger/OpenAPI 3.0 specification.

## Accessing Documentation

Once the server is running, you can access the documentation at:

- **Swagger UI**: http://localhost:3000/api-docs
- **OpenAPI JSON**: http://localhost:3000/api-docs.json
- **API Info**: http://localhost:3000/

## Configuration

The Swagger UI server runs on port **3000** by default (configurable via `EXPRESS_PORT` environment variable).

### Environment Variables

```bash
# Express server port for Swagger UI
EXPRESS_PORT=3000
```

## Features

The Swagger documentation includes:

### 1. **ComfyUI Services**
All registered workflow services from your `config.json` are automatically documented with:
- Request parameters with types and descriptions
- Required vs optional parameters
- Default values
- Response schemas
- Usage examples

### 2. **Job Management**
Documentation for all job-related endpoints:
- `query_job_status` - Query job status and progress
- `list_jobs` - List jobs with filters
- `get_job_result` - Get completed job results

### 3. **System**
- `comfyui_health_check` - Health check and statistics

## Interactive Testing

Swagger UI provides a "Try it out" button for each endpoint, allowing you to:

1. **Test API endpoints directly from the browser**
2. **Fill in request parameters with forms**
3. **View formatted responses**
4. **Copy example requests for use in your code**

### Example Workflow

1. Navigate to http://localhost:3000/api-docs
2. Expand a service endpoint (e.g., `/text_to_image`)
3. Click "Try it out"
4. Fill in the required parameters
5. Click "Execute" to send the request
6. View the response containing your `job_id`
7. Use the `job_id` with `query_job_status` to monitor progress
8. Use `get_job_result` to retrieve the final images

## API Documentation Structure

### Service Endpoints

Each service endpoint (like `text_to_image`) accepts:

```json
{
  "parameter_name": "value",
  "optional_parameter": "optional_value"
}
```

**Response:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Job created successfully. Use query_job_status to check progress."
}
```

### Job Status Endpoint

**Request:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "job_id": "...",
  "service": "text_to_image",
  "status": "running",
  "created_at": "2025-12-24T10:30:00.000Z",
  "started_at": "2025-12-24T10:30:01.000Z",
  "progress": {
    "current": 5,
    "maximum": 8,
    "node": "4",
    "cachedNodes": ["1", "17", "18"],
    "timestamp": "2025-12-24T10:30:15.000Z"
  },
  "parameters": { "prompt": "a beautiful sunset" }
}
```

### Job Result Endpoint

**Request:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:** Includes metadata and all generated images with URLs.

## Docker Deployment

When using Docker, both ports are exposed:

```yaml
services:
  comfyui-mcp:
    ports:
      - "8080:8080"  # FastMCP server
      - "3000:3000"  # Swagger UI
```

Access documentation at: `http://<docker-host>:3000/api-docs`

## Customization

### Modifying Swagger Spec

The Swagger specification is dynamically generated from your `config.json`. To add or modify endpoints:

1. Edit [config.example.json](../config.example.json)
2. Add new services or modify existing ones
3. Restart the server
4. Swagger documentation updates automatically

### Custom CSS/UI

Modify the Swagger UI appearance in [src/express-server.ts](../src/express-server.ts):

```typescript
swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ComfyUI MCP API Documentation',
  swaggerOptions: {
    // ... options
  },
})
```

## Security Considerations

For production deployments:

1. **Disable Swagger UI** in production by not starting the Express server
2. **Add authentication** to protect the documentation
3. **Use reverse proxy** with basic auth (nginx, Apache)
4. **Restrict network access** to documentation endpoints

Example: Disable in production

```typescript
if (process.env.NODE_ENV !== 'production') {
  // Only start Swagger UI in development
  const expressServer = createServer(expressApp)
  expressServer.listen(expressPort, ...)
}
```

## Troubleshooting

### Port Already in Use

If port 3000 is already in use:

```bash
# Use a different port
EXPRESS_PORT=3001 npm run dev
```

### Can't Access Documentation

1. Check if the Express server started successfully
2. Verify the port in console output
3. Check firewall settings
4. Ensure the service is running: `curl http://localhost:3000/health`

### Documentation Not Updating

1. Restart the server after modifying `config.json`
2. Clear browser cache
3. Check for errors in server logs

## Additional Resources

- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [Swagger UI Documentation](https://swagger.io/tools/swagger-ui/)
- [FastMCP Documentation](https://github.com/jina-ai/fastmcp)
