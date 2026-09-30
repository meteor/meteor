# Jam Method

- `Who maintains the package` – [William Reiske](https://github.com/wreiske/meteor-wormhole/commits?author=wreiske)

[[toc]]

## What Is It?

Meteor Wormhole is a **server-only, Meteor 3.4+ package** that bridges your Meteor methods to the outside world through:

- **[MCP (Model Context Protocol)](https://modelcontextprotocol.io/)** — The open standard for connecting AI assistants to tools and data. Your methods become MCP tools that Claude, GPT, Cursor, VS Code Copilot, and any MCP-compatible client can discover and invoke.
- **REST API** — Every exposed method also gets a `POST /api/<method>` endpoint.
- **OpenAPI 3.1 spec** — Auto-generated from your method schemas.
- **Swagger UI** — Built-in interactive API docs at `/api/docs`.

## How It Works

Two lines to get started:

```js
import { Wormhole } from 'meteor/wreiske:meteor-wormhole';

Wormhole.init(); // That's it — all your methods are now MCP tools
```

By default it runs in **"all-in" mode**, which automatically exposes every `Meteor.methods()` call (minus DDP internals, private `_`-prefixed methods, and Accounts methods). You can also run in **"opt-in" mode** for explicit control:

```js
Wormhole.init({ mode: 'opt-in' });

Wormhole.expose('todos.add', {
  description: 'Add a new todo item',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The todo title' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] }
    },
    required: ['title']
  }
});
```

Add richer schemas and descriptions, and AI agents get better context about what your tools do and how to call them.

## Features at a Glance

- **Zero-config MCP server** — Streamable HTTP transport at `/mcp`, session management, JSON-RPC 2.0
- **Optional REST bridge** — Enable with `rest: { enabled: true }` for traditional HTTP clients
- **Auto-generated OpenAPI 3.1 spec** with Swagger UI
- **Optional API key auth** — Covers both MCP and REST endpoints
- **Smart exclusions** — Automatically skips DDP internals, `_private` methods, and Accounts methods; add your own patterns
- **Input validation** — JSON Schema → Zod conversion for parameter validation
- **Error propagation** — `Meteor.Error` details are properly passed through to clients
- **Enrich existing methods** — Add descriptions and schemas to auto-registered methods with `Wormhole.expose()`

## Configuration Options

```js
Wormhole.init({
  mode: 'all',             // 'all' or 'opt-in'
  path: '/mcp',            // MCP endpoint path
  name: 'my-app',          // MCP server name
  apiKey: 'secret',        // Optional bearer token auth
  exclude: [/^admin\./],   // Additional exclusion patterns
  rest: {
    enabled: true,         // Enable REST API
    path: '/api',          // REST base path
    docs: true             // Swagger UI at /api/docs
  }
});
```

## Point Your MCP Client at It

If you use Claude Desktop, Cursor, VS Code Copilot, or any other MCP-compatible client, you can connect to a Wormhole-enabled app and your AI assistant will immediately see all the exposed methods as callable tools. Just point it at your app's `/mcp` endpoint.

## API Reference

### `Wormhole.init(options)`

Initialize the MCP bridge.

| Option    | Type                   | Default             | Description                        |
| --------- | ---------------------- | ------------------- | ---------------------------------- |
| `mode`    | `'all' \| 'opt-in'`    | `'all'`             | Exposure mode                      |
| `path`    | `string`               | `'/mcp'`            | HTTP endpoint path                 |
| `name`    | `string`               | `'meteor-wormhole'` | MCP server name                    |
| `version` | `string`               | `'1.0.0'`           | MCP server version                 |
| `apiKey`  | `string \| null`       | `null`              | Bearer token for auth              |
| `exclude` | `(string \| RegExp)[]` | `[]`                | Methods to exclude (all-in mode)   |
| `rest`    | `object \| boolean`    | `false`             | REST API configuration (see below) |

#### `rest` options

| Option    | Type             | Default     | Description                                  |
| --------- | ---------------- | ----------- | -------------------------------------------- |
| `enabled` | `boolean`        | `false`     | Enable REST endpoints                        |
| `path`    | `string`         | `'/api'`    | Base path for REST endpoints                 |
| `docs`    | `boolean`        | `true`      | Serve Swagger UI at `<path>/docs`            |
| `apiKey`  | `string \| null` | _inherited_ | API key for REST (defaults to main `apiKey`) |

Shorthand: `rest: true` enables REST with all defaults.

### `Wormhole.expose(methodName, options)`

Explicitly expose a method as an MCP tool.

| Option         | Type     | Description                                                                             |
| -------------- | -------- | --------------------------------------------------------------------------------------- |
| `description`  | `string` | Human-readable tool description                                                         |
| `inputSchema`  | `object` | JSON Schema for method parameters                                                       |
| `outputSchema` | `object` | JSON Schema for the return value (wrapped inside `{ result }` envelope in OpenAPI/REST) |

### `Wormhole.unexpose(methodName)`

Remove a method from MCP exposure.

## How It Works

1. **Registration**: In all-in mode, the package monkey-patches `Meteor.methods` to intercept every method registration. In opt-in mode, you call `Wormhole.expose()` manually.

2. **MCP Server**: A Streamable HTTP MCP server is mounted at the configured path (default `/mcp`) on Meteor's `WebApp`.

3. **Tool Mapping**: Each exposed Meteor method becomes an MCP tool. Method names are sanitized (e.g., `todos.add` → `todos_add`).

4. **Invocation**: When an AI agent calls a tool, the bridge invokes the corresponding Meteor method via `Meteor.callAsync()` and returns the result.

5. **REST API** (optional): When enabled, a parallel REST bridge mounts at the configured path. Each method gets a `POST` endpoint. An OpenAPI 3.1 spec is auto-generated from the registry's metadata and input schemas, and Swagger UI provides interactive documentation.


## Links

- **GitHub:** https://github.com/wreiske/meteor-wormhole
- **Live Demo:** https://wormhole.meteorapp.com/
- **Swagger UI:** https://wormhole.meteorapp.com/api/docs
- **Atmosphere:** [https://atmospherejs.com/wreiske/meteor-wormhole](https://atmospherejs.com/wreiske/meteor-wormhole)
- **Packosphere:** [https://packosphere.com/wreiske/meteor-wormhole](https://packosphere.com/wreiske/meteor-wormhole)
