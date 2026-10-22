# Websocket Compression in Meteor

::: warning
Modifying websocket compression settings without understanding your application's DDP messaging patterns can negatively impact performance. Before changing these settings, you should:
- Use [Meteor DevTools Evolved](https://chromewebstore.google.com/detail/meteor-devtools-evolved/ibniinmoafhgbifjojidlagmggecmpgf) or your browser's Network tab to monitor WebSocket traffic
- Analyze your DDP message frequency and payload sizes  
- Test changes in a staging environment with realistic data and user load
:::

Meteor's stream server uses the permessage-deflate extension for websocket compression by default. While compression can help reduce bandwidth usage, it may impact performance in reactivity-intensive applications due to the computational overhead of compressing numerous DDP messages.

## Configuration

### Disabling Compression

You can disable websocket compression by setting the `SERVER_WEBSOCKET_COMPRESSION` environment variable to `false`:

```bash
SERVER_WEBSOCKET_COMPRESSION=false
```

### Custom Compression Settings

To customize compression settings, set `SERVER_WEBSOCKET_COMPRESSION` to a JSON string with your desired configuration:

```bash
# Example with custom settings
SERVER_WEBSOCKET_COMPRESSION='{"threshold": 2048, "level": 1}'
```

Available configuration options:

- `threshold`: Minimum message size (in bytes) before compression is applied (default: 1024)
- `level`: Compression level (0-9, where 0=none, 1=fastest, 9=best compression)
- `memLevel`: Memory level (1-9, lower uses less memory)
- `noContextTakeover`: When true, compressor resets for each message (default: true)
- `maxWindowBits`: Window size for compression (9-15, lower uses less memory)

## Configuration Examples

Here are recommended configurations for different types of applications:

### High-Frequency Updates / Real-Time Dashboard

For applications with frequent small updates (e.g., real-time dashboards, trading platforms):

```bash
# Disable compression for optimal performance with small, frequent updates
SERVER_WEBSOCKET_COMPRESSION=false
```

### Large Data Transfers

For applications transferring large datasets (e.g., file sharing, data visualization):

```bash
# Optimize for large data transfers
SERVER_WEBSOCKET_COMPRESSION='{"threshold": 1024, "level": 6, "memLevel": 8}'
```

### Memory-Constrained Environment

For deployments with limited memory resources:

```bash
# Minimize memory usage while maintaining compression
SERVER_WEBSOCKET_COMPRESSION='{"threshold": 2048, "level": 1, "memLevel": 1, "maxWindowBits": 9}'
```

### Balanced Configuration

For typical applications with mixed message sizes:

```bash
# Balance between compression and performance
SERVER_WEBSOCKET_COMPRESSION='{"threshold": 1536, "level": 3, "memLevel": 4}'
```

## Verifying Compression Status

You can check if compression is enabled through the Meteor shell:

```javascript
Meteor.server.stream_server.server.options.faye_server_options.extensions
```

Results interpretation:
- `[]` (empty array): Compression is disabled
- `[{}]` (array with object): Compression is enabled

## Performance Considerations

- For apps with high message throughput or frequent small updates, disabling compression may improve performance
- Large message payloads may benefit from compression, especially over slower network connections
- Consider monitoring CPU usage and response times when adjusting compression settings

## Default Configuration

When enabled, the default configuration uses:
- Compression threshold: 1024 bytes
- Compression level: Z_BEST_SPEED (fastest)
- Memory level: Z_MIN_MEMLEVEL (minimum memory usage)
- Context takeover: Disabled
- Window bits: Z_MIN_WINDOWBITS (minimum window size)
