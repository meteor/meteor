# Meteor-RPC

- `Who maintains the package` – [Grubba27](https://github.com/Grubba27), you can get in touch via [X](https://twitter.com/gab_grubba)

[[toc]]

## What is this package?

_Inspired on [zodern:relay](https://github.com/zodern/meteor-relay) and on [tRPC](https://trpc.io/)_

This package provides functions for building E2E type-safe RPCs focused on React front ends.

## How to download it?

::: warning

This package works only with Meteor 2.8 or higher.

If you are not sure about the version of Meteor you are using, you can check it by running the following command in your terminal within your project:

```bash
meteor --version
```

:::

```bash
meteor npm i meteor-rpc @tanstack/react-query zod
```

::: warning

Before continuing the installation, make sure you have `react-query` all set in your project; for more info, follow their [quick start guide](https://tanstack.com/query/latest/docs/framework/react/quick-start).

:::

## How to use it?

There are a few concepts that are important while using this package:

- This package is built on top of [`Meteor.methods`](../api/meteor.md#method-apis-methods) and [`Meteor.publish`](../api/meteor.md#publish-and-subscribe-pubsub) but with types and runtime validation, their understanding is important to use this package.
- Every method and publication uses `Zod` to validate the arguments, so you can be sure that the data you are receiving is what you expect.

::: tip
If you are accepting any type of data, you can use `z.any()` as the schema or `z.void` when there is no argument
:::

### `createModule`

This function is used to create a module that will be used to call our methods and publications

`subModule` without a namespace: `createModule()` is used to create the `main` server module, the one that will be exported to be used in the client.`

`subModule` with a namespace: `createModule("namespace")` is used to create a submodule that will be added to the main module.

> Remember to use `build` at the end of module creation to ensure that the module will be created.

Example:

::: code-group

```typescript [server/main.ts]
import { createModule } from "meteor-rpc";
import { Chat } from "./chat";

const server = createModule() // server has no namespace
  .addMethod("bar", z.string(), (arg) => "bar" as const)
  .addSubmodule(Chat)
  .build();

export type Server = typeof server;
```

```typescript [server/chat.ts]
import { createModule } from "meteor-rpc";
import { ChatCollection } from "/imports/api/chat";
import { z } from "zod";

export const Chat = createModule("chat")
  .addMethod("createChat", z.void(), async () => {
    return ChatCollection.insertAsync({ createdAt: new Date(), messages: [] });
  })
  .buildSubmodule();
```

```typescript [client/main.ts]
import { createClient } from "meteor-rpc";
// you must import the type of the server
import type { Server } from "/imports/api/server";

const api = createClient<Server>();
const bar: "bar" = await api.bar("some string");
// ?^ 'bar'
const newChatId = await api.chat.createChat(); // with intellisense
```

:::

### `module.addMethod`

Type:

```ts
addMethod(
  name: string,
  schema: ZodSchema,
  handler: (args: ZodTypeInput<ZodSchema>) => T,
  config?: Config<ZodTypeInput<ZodSchema>, T>
)
```

This is the equivalent of `Meteor.methods` but with types and runtime validation.

::: code-group

```typescript [server/with-meteor-rpc.ts]
import { createModule } from "meteor-rpc";
import { z } from "zod";

const server = createModule()
  .addMethod("foo", z.string(), (arg) => "foo" as const)
  .build();
```

```typescript [server/without-meteor-rpc.ts]
import { Meteor } from "meteor/meteor";
import { z } from "zod";

Meteor.methods({
  foo(arg: string) {
    z.string().parse(arg);
    return "foo";
  },
});
```

:::

### `module.addPublication`

Type:

```typescript
addPublication(
  name: string,
  schema: ZodSchema,
  handler: (args: ZodTypeInput<ZodSchema>) => Cursor<Result, Result>
)
```

This is the equivalent of `Meteor.publish` but with types and runtime validation.

::: code-group

```typescript [server/with-meteor-rpc.ts]
import { createModule } from "meteor-rpc";
import { ChatCollection } from "/imports/api/chat";
import { z } from "zod";

const server = createModule()
  .addPublication("chatRooms", z.void(), () => {
    return ChatCollection.find();
  })
  .build();
```

```typescript [server/without-meteor-rpc.ts]
import { Meteor } from "meteor/meteor";
import { ChatCollection } from "/imports/api/chat";

Meteor.publish("chatRooms", function () {
  return ChatCollection.find();
});
```

:::

### `module.addSubmodule`

This is used to add a submodule to the main module, adding namespaces for your methods and publications and making it easier to organize your code.

> Remember to use `submodule.buildSubmodule` when creating a submodule

::: code-group

```typescript [server/chat.ts]
import { ChatCollection } from "/imports/api/chat";
import { createModule } from "meteor-rpc";

export const chatModule = createModule("chat")
  .addMethod("createChat", z.void(), async () => {
    return ChatCollection.insertAsync({ createdAt: new Date(), messages: [] });
  })
  .buildSubmodule(); // <-- This is important so that this module can be added as a submodule
```

```typescript [server/chat.ts]
import { createModule } from "meteor-rpc";
import { chatModule } from "./server/chat";

const server = createModule()
  .addMethod("bar", z.string(), (arg) => "bar" as const)
  .addSubmodule(chatModule)
  .build();

server.chat; // <-- this is the namespace for the chat module
server.chat.createChat(); // <-- this is the method from the chat module and it gets autocompleted
```

:::

### `module.addMiddlewares`

Type:

```typescript
type Middleware = (raw: unknown, parsed: unknown) => void;

addMiddlewares(middlewares: Middleware[])
```

This is used to add middleware to the module; it should be used to add side effects logic to the methods and publications, which is ideal for logging or rate limiting.

The middleware ordering is last in, first out. Check the example below:

::: code-group

```typescript [server/chat.ts]
import { ChatCollection } from "/imports/api/chat";
import { createModule } from "meteor-rpc";

export const chatModule = createModule("chat")
  .addMiddlewares([
    (raw, parsed) => {
      console.log("runs first");
    },
  ])
  .addMethod("createChat", z.void(), async () => {
    return ChatCollection.insertAsync({ createdAt: new Date(), messages: [] });
  })
  .buildSubmodule();
```

```typescript [server/main.ts]
import { createModule } from "meteor-rpc";
import { chatModule } from "./server/chat";

const server = createModule()
  .addMiddlewares([
    (raw, parsed) => {
      console.log("runs second");
    },
  ])
  .addMethod("bar", z.string(), (arg) => "bar" as const)
  .addSubmodule(chatModule)
  .build();
```

```typescript [client/main.ts]
import { createClient } from "meteor-rpc";
import type { Server } from "/imports/api/server"; // you must import the type

const api = createClient<Server>();
await api.chat.createChat(); // logs "runs first" then "runs second"
await api.bar("str"); // logs "runs second"
```

:::

### `module.build`

This is used to build the module, it should be used at the end of the module creation to ensure that the exported type is correct.

::: code-group

```typescript [correct.ts]
// ✅ it has the build method
import { createModule } from "meteor-rpc";
import { z } from "zod";
const server = createModule()
  .addMethod("bar", z.string(), (arg) => "bar" as const)
  .build();

export type Server = typeof server;
```

```typescript [incorrect.ts]
// ❌ it is missing the build method
import { createModule } from "meteor-rpc";
import { z } from "zod";
const server = createModule().addMethod(
  "bar",
  z.string(),
  (arg) => "bar" as const
);

export type Server = typeof server;
```

:::

### `module.buildSubmodule`

This is used to build the submodule, it should be used at the end of the submodule creation and imported in the main module in the [`addSubmodule`](./meteor-rpc.md#module-addsubmodule) method.

::: code-group

```typescript [correct.ts]
import { createModule } from "meteor-rpc";
import { z } from "zod";

export const chatModule = createModule("chat")
  .addMethod("createChat", z.void(), async () => {
    return "chat" as const;
  })
  // ✅ it has the buildSubmodule method
  .buildSubmodule();
```

```typescript [incorrect.ts]
import { createModule } from "meteor-rpc";
import { z } from "zod";

export const otherSubmodule = createModule("other")
  .addMethod("otherMethod", z.void(), async () => {
    return "other" as const;
  })
  // ❌ it is missing the buildSubmodule method
  .build();

export const otherSubmodule = createModule("other").addMethod(
  "otherMethod",
  z.void(),
  async () => {
    return "other" as const;
  }
); // ❌ it is missing the buildSubmodule method
```

```typescript [server/main.ts]
import { createModule } from "meteor-rpc";
import { chatModule } from "./server/chat";

const server = createModule()
  .addMethod("bar", z.string(), (arg) => "bar" as const)
  .addSubmodule(chatModule)
  .build();
```

:::

## Using in the client

When using in the client, you _have_ to use the `createModule` and `build` methods to create a module that will be used in the client
and be sure that you are exporting the type of the module

_You should only create one client in your application_

You can have something like `api.ts` that will export the client and the type of the client

::: code-group

```typescript [server/main.ts]
import { createModule } from "meteor-rpc";

const server = createModule()
  .addMethod("bar", z.string(), (arg) => "bar" as const)
  .build();

export type Server = typeof server;
```

```typescript [client/main.ts]
// you must import the type
import type { Server } from "/imports/api/server";
const app = createClient<Server>();

await app.bar("str"); // it will return "bar"
```

:::

## React focused API

Our package has a React-focused API that uses `react-query` to handle the data fetching and mutations.

### `method.useMutation`

It uses the [`useMutation`](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation#usemutation) from react-query to create a mutation that will call the method

::: code-group

```typescript [server/main.ts]
import { createModule } from "meteor-rpc";

const server = createModule()
  .addMethod("bar", z.string(), (arg) => {
    console.log("Server received", arg);
    return "bar" as const;
  })
  .build();

export type Server = typeof server;
```

```tsx [client.ts]
// you must import the type
import type { Server } from "/imports/api/server";
const app = createClient<Server>();

export const Component = () => {
  const { mutate, isLoading, isError, error, data } = app.bar.useMutation();

  return (
    <button
      onClick={() => {
        mutation.mutate("str");
      }}
    >
      Click me
    </button>
  );
};
```

:::

### `method.useQuery`

It uses the [`useQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseQuery#usesuspensequery) from react-query to create a query that will call the method, it uses `suspense` to handle loading states

::: code-group

```typescript [server/main.ts]
import { createModule } from "meteor-rpc";

const server = createModule()
  .addMethod("bar", z.string(), (arg) => "bar" as const)
  .build();

export type Server = typeof server;
```

```tsx [client.ts]
// you must import the type of the server
import type { Server } from "/imports/api/server";
const app = createClient<Server>();

export const Component = () => {
  const { data } = app.bar.useQuery("str"); // this will trigger suspense

  return <div>{data}</div>;
};
```

:::

### `publication.useSubscription`

Subscriptions on the client have `useSubscription` method that can be used as a hook to subscribe to a publication. It uses `suspense` to handle loading states

::: code-group

```typescript [server/main.ts]
// server/main.ts
import { createModule } from "meteor-rpc";
import { ChatCollection } from "/imports/api/chat";
import { z } from "zod";

const server = createModule()
  .addPublication("chatRooms", z.void(), () => {
    return ChatCollection.find();
  })
  .build();

export type Server = typeof server;
```

```tsx [client.ts]
import type { Server } from "/imports/api/server"; // you must import the type
const app = createClient<Server>();

export const Component = () => {
  // it will trigger suspense and `rooms` is reactive in this context.
  // When there is a change in the collection it will rerender
  const { data: rooms, collection: chatCollection } =
    api.chatRooms.usePublication();

  return (
    <div>
      {rooms.map((room) => (
        <div key={room._id}>{room.name}</div>
      ))}
    </div>
  );
};
```

:::

## Examples

Currently, we have:

- [chat-app](https://github.com/Grubba27/testing-meteor-rpc) that uses this package to create a chat-app
- [askme](https://github.com/fredmaiaarantes/askme) that uses this package to create a Q&A app, you can check it live [here](https://askmeaquestion.meteorapp.com/)

## Advanced usage

You can take advantage of the hooks to add custom logic to your methods, checking the raw and parsed data and the result of the method,
If the method fails, you can also check the error.

::: code-group

```typescript [on-method-after-creation.ts]
import { createModule } from "meteor-rpc";
import { z } from "zod";

const server = createModule()
  .addMethod("bar", z.string(), (arg) => "bar" as const)
  .build();

// you can add hooks after the method has been created
server.bar.addBeforeResolveHook((raw, parsed) => {
  console.log("before resolve", raw, parsed);
});

server.bar.addAfterResolveHook((raw, parsed, result) => {
  console.log("after resolve", raw, parsed, result);
});

server.bar.addErrorResolveHook((err, raw, parsed) => {
  console.log("on error", err, raw, parsed);
});

export type Server = typeof server;
```

```typescript [on-method-creation.ts]
import { createModule } from "meteor-rpc";
import { z } from "zod";

const server = createModule()
  // Or you can add hooks when creating the method
  .addMethod("bar", z.any(), () => "str", {
    hooks: {
      onBeforeResolve: [
        (raw, parsed) => {
          console.log("before resolve", raw, parsed);
        },
      ],
      onAfterResolve: [
        (raw, parsed, result) => {
          console.log("after resolve", raw, parsed, result);
        },
      ],
      onErrorResolve: [
        (err, raw, parsed) => {
          console.log("on error", err, raw, parsed);
        },
      ],
    },
  })
  .build();

export type Server = typeof server;
```

:::

## Known issues

if you are getting a similar error like this one:

```text

=> Started MongoDB.
Typescript processing requested for web.browser using Typescript 5.7.2
Creating new Typescript watcher for /app
Starting compilation in watch mode...
Compiling server/chat/model.ts
Compiling server/chat/module.ts
Compiling server/main.ts
Writing .meteor/local/plugin-cache/refapp_meteor-typescript/0.5.6/v2cache/buildfile.tsbuildinfo
Compilation finished in 0.3 seconds. 3 files were (re)compiled.
did not find /app/.meteor/local/plugin-cache/refapp_meteor-typescript/0.5.6/v2cache/out/client/main.js
did not find /app/.meteor/local/plugin-cache/refapp_meteor-typescript/0.5.6/v2cache/out/client/main.js
Nothing emitted for client/main.tsx
node:internal/crypto/hash:115
    throw new ERR_INVALID_ARG_TYPE(
          ^

TypeError [ERR_INVALID_ARG_TYPE]: The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received null
    at Hash.update (node:internal/crypto/hash:115:11)
    at /Users/user/.meteor/packages/meteor-tool/.3.0.4.1tddsze.as7rh++os.osx.arm64+web.browser+web.browser.legacy+web.cordova/mt-os.osx.arm64/tools/fs/tools/fs/watch.ts:329:28
    at Array.forEach (<anonymous>)
    at /Users/user/.meteor/packages/meteor-tool/.3.0.4.1tddsze.as7rh++os.osx.arm64+web.browser+web.browser.legacy+web.cordova/mt-os.osx.arm64/tools/fs/tools/fs/watch.ts:329:8
    at JsOutputResource._get (/tools/isobuild/compiler-plugin.js:1002:19) {
  code: 'ERR_INVALID_ARG_TYPE'
}

Node.js v20.18.0
```

Please check if you are using `refapp:meteor-typescript` package, if so, you can remove it and use the `typescript` package instead.
The `refapp:meteor-typescript` package is currently incompatible with the `meteor-rpc` package.

If it is still not working, please open an issue in the [repo](https://github.com/Grubba27/meteor-rpc)
