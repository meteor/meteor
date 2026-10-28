# Meteor-RPC

- `Who maintains the package` – [Grubba27](https://github.com/Grubba27), you can get in touch via [X](https://twitter.com/gab_grubba)

[[toc]]

## What is this package?

_Inspired by [zodern:relay](https://github.com/zodern/meteor-relay) and [tRPC](https://trpc.io/)_

This package gives you end-to-end type-safe Meteor methods and publications, with
[TanStack Query](https://tanstack.com/query) hooks for React.

You define your API once on the server, validating inputs with any
[Standard Schema](https://standardschema.dev) library (zod, valibot, arktype, …). The client gets a
typed object: every method is autocompleted, inputs are checked at compile time and validated at
runtime, and results are typed from what your resolvers return.

::: info
This page documents meteor-rpc 2. Upgrading from 1.x? Read the
[migration guide](https://github.com/Grubba27/meteor-rpc/blob/main/MIGRATION.md): a codemod
(`meteor-rpc-migrate`) does most of the work.
:::

## How to download it?

::: warning

This package works only with Meteor 3.0 or higher.

If you are not sure about the version of Meteor you are using, you can check it by running the following command in your terminal within your project:

```bash
meteor --version
```

:::

```bash
meteor npm install meteor-rpc zod @tanstack/react-query
```

| Requirement | Version |
| --- | --- |
| Meteor | 3.0 or later |
| Validator | any Standard Schema: zod ≥ 3.24, valibot ≥ 1.0, arktype ≥ 2.0, … |
| React and `@tanstack/react-query` (only for the hooks) | React 18.2+ or 19, TanStack Query 5 |
| TypeScript (optional) | 5.0 or later. Works with `@types/meteor`, `zodern:types` and Meteor 3.6 native types. |

React and TanStack Query are peer dependencies: the package uses your copies. If you use the React
hooks, set up TanStack Query first; see their
[quick start guide](https://tanstack.com/query/latest/docs/framework/react/quick-start).

## How to use it?

There are a few concepts that are important while using this package:

- It is built on top of [`Meteor.methods`](../api/meteor.md#method-apis-methods) and
  [`Meteor.publish`](../api/meteor.md#publish-and-subscribe-pubsub), with types and runtime
  validation. Understanding them helps.
- Every method and publication validates its input with your schema before your code runs.
  Use `z.void()` when there is no input.
- You create one root module, `createModule()`, and finish it with `build()`. Namespaces are
  submodules, `createModule("namespace")`, finished with `buildSubmodule()`.
- The client imports only the **type** of the server, so no server code reaches the browser.

| Import | Contains | Needs React |
| --- | --- | --- |
| `meteor-rpc` | everything below | yes |
| `meteor-rpc/server` | `createModule`, `createCaller`, server types | no |
| `meteor-rpc/client` | `createClient` without hooks (Blaze, Vue, scripts) | no |
| `meteor-rpc/react` | `createClient` with the React hooks | yes |

### `createModule`

This function creates a module that holds methods and publications.

- `createModule()`, without a namespace, is the root module: the one whose type the client uses.
- `createModule("namespace")` is a submodule, added to the root module with `addSubmodule`.

::: code-group

```ts [imports/api/server.ts]
import { createModule } from "meteor-rpc/server";
import { z } from "zod";
import { tasks } from "./tasks";

const server = createModule() // the root module has no namespace
  .addMethod("ping", z.void(), () => "pong" as const)
  .addSubmodule(tasks)
  .build(); // registers everything with Meteor

export type Server = typeof server;
```

```ts [imports/api/tasks.ts]
import { createModule } from "meteor-rpc/server";
import { z } from "zod";
import { Tasks } from "./collections";

export const tasks = createModule("tasks")
  .addMethod("add", z.object({ title: z.string().min(1) }), ({ title }, { userId }) =>
    Tasks.insertAsync({ title, done: false, owner: userId }),
  )
  .buildSubmodule();
```

```ts [imports/api/client.ts]
import { createClient } from "meteor-rpc";
// import only the type of the server
import type { Server } from "/imports/api/server";

export const api = createClient<Server>();

const pong = await api.ping(); // "pong"
const taskId = await api.tasks.add({ title: "Write docs" }); // autocompleted and type-checked
```

:::

Import the file that calls `build()` from your server entry (for example `server/main.ts`).

### `module.addMethod`

Type:

```ts
addMethod(name, schema, resolver: (input, context) => result, config?)
```

This is the equivalent of `Meteor.methods`, with types and runtime validation.

- The resolver receives the input after validation (and after any schema transform), and a
  context: `{ userId, connection, name, type, invocation }`. A `function` resolver also gets
  Meteor's `this`.
- The client receives the awaited return value.

::: code-group

```ts [server/with-meteor-rpc.ts]
import { createModule } from "meteor-rpc/server";
import { z } from "zod";

const server = createModule()
  .addMethod("greet", z.object({ name: z.string() }), ({ name }) => `Hello, ${name}!`)
  .build();
```

```ts [server/without-meteor-rpc.ts]
import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";

Meteor.methods({
  greet({ name }: { name: string }) {
    check(name, String);
    return `Hello, ${name}!`;
  },
});
```

:::

### `module.addPublication`

Type:

```ts
addPublication(name, schema, resolver: (input, context) => cursor | undefined, config?)
```

This is the equivalent of `Meteor.publish`, with types and runtime validation. The resolver returns
one cursor, or nothing (the subscription is then ready with no documents).

::: code-group

```ts [server/with-meteor-rpc.ts]
import { createModule } from "meteor-rpc/server";
import { z } from "zod";
import { Tasks } from "/imports/api/tasks";

const server = createModule()
  .addPublication("myTasks", z.void(), (_input, { userId }) => {
    if (!userId) return;
    return Tasks.find({ owner: userId });
  })
  .build();
```

```ts [server/without-meteor-rpc.ts]
import { Meteor } from "meteor/meteor";
import { Tasks } from "/imports/api/tasks";

Meteor.publish("myTasks", function () {
  if (!this.userId) return this.ready();
  return Tasks.find({ owner: this.userId });
});
```

:::

On the client, the documents of each publication and input land in a collection of their own, so
they never mix with other subscriptions. Read them with
[`usePublication`](#publication-usepublication).

### `module.addSharedPublication`

Type:

```ts
addSharedPublication(name, schema, resolver: (input, context) => { [key]: cursor }, config?)
```

This is similar to [`addPublication`](#module-addpublication), but it returns several named cursors,
which is useful when one subscription needs several collections. Each key gets its own client
collection, so documents with the same `_id` in different collections never overwrite each other.

::: code-group

```ts [server/with-meteor-rpc.ts]
import { createModule } from "meteor-rpc/server";
import { z } from "zod";

// Rooms and Messages are Mongo collections
const chat = createModule("chat")
  .addSharedPublication("room", z.string(), (roomId) => ({
    room: Rooms.find({ _id: roomId }),
    messages: Messages.find({ roomId }),
  }))
  .buildSubmodule();
```

```ts [server/without-meteor-rpc.ts]
import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";

Meteor.publish("chat.room", function (roomId: string) {
  check(roomId, String);
  return [Rooms.find({ _id: roomId }), Messages.find({ roomId })];
});
```

:::

### `module.addSubmodule`

This adds a submodule to a module, giving its methods and publications a namespace. Submodules nest
as deep as you like: `chat.messages.send`.

> Finish a submodule with `buildSubmodule()` before adding it.

::: code-group

```ts [imports/api/chat.ts]
import { createModule } from "meteor-rpc/server";
import { z } from "zod";

export const chat = createModule("chat")
  .addMethod("send", z.object({ roomId: z.string(), text: z.string() }), ({ roomId, text }) =>
    Messages.insertAsync({ roomId, text, createdAt: new Date() }),
  )
  .buildSubmodule(); // <-- needed to add it to another module
```

```ts [imports/api/server.ts]
import { createModule } from "meteor-rpc/server";
import { chat } from "./chat";

const server = createModule()
  .addSubmodule(chat) // registered as "chat.send"
  .build();

export type Server = typeof server; // the client calls api.chat.send(…)
```

:::

### `module.addMiddlewares`

Type:

```ts
type Middleware = (context: { userId, connection, name, type, raw, parsed }) => unknown;

addMiddlewares(middlewares: Middleware[])
```

Middlewares run for every method **and publication** of the module and of its submodules, after the
input is validated and before the resolver. Use them for authorization, logging or auditing. Throw
to reject the call; throw a `Meteor.Error` so the client gets a meaningful error.

They run from the root module down, in the order you added them. Check the example below:

::: code-group

```ts [imports/api/admin.ts]
import { Meteor } from "meteor/meteor";
import { createModule } from "meteor-rpc/server";
import { z } from "zod";

export const admin = createModule("admin")
  .addMiddlewares([
    ({ name }) => {
      console.log("runs second", name);
    },
  ])
  .addMethod("stats", z.void(), async () => ({ users: await Meteor.users.find().countAsync() }))
  .buildSubmodule();
```

```ts [imports/api/server.ts]
import { Meteor } from "meteor/meteor";
import { createModule } from "meteor-rpc/server";
import { z } from "zod";
import { admin } from "./admin";

const server = createModule()
  .addMiddlewares([
    ({ userId }) => {
      console.log("runs first");
      if (!userId) throw new Meteor.Error("not-authorized");
    },
  ])
  .addMethod("ping", z.void(), () => "pong" as const)
  .addSubmodule(admin)
  .build();

export type Server = typeof server;
```

:::

`await api.admin.stats()` logs "runs first" then "runs second". `await api.ping()` only logs
"runs first".

### `module.build`

This finishes the root module: it registers every method and publication with Meteor under its full
name, and returns the value whose type you export for the client. Only the root module,
`createModule()` without a namespace, is built with `build()`.

::: code-group

```ts [correct.ts]
// ✅ the root module, finished with build()
import { createModule } from "meteor-rpc/server";
import { z } from "zod";

const server = createModule()
  .addMethod("ping", z.void(), () => "pong" as const)
  .build();

export type Server = typeof server;
```

```ts [incorrect.ts]
// ❌ a namespaced module can't be built: TypeScript reports it, and it throws at runtime
import { createModule } from "meteor-rpc/server";
import { z } from "zod";

const server = createModule("chat")
  .addMethod("ping", z.void(), () => "pong" as const)
  .build(); // use buildSubmodule() and add it to the root module
```

:::

### `module.buildSubmodule`

This finishes a submodule, so it can be passed to [`addSubmodule`](#module-addsubmodule) of the root
module (or of another submodule). It registers nothing by itself.

```ts
import { createModule } from "meteor-rpc/server";
import { z } from "zod";

export const chat = createModule("chat")
  .addMethod("ping", z.void(), () => "pong" as const)
  .buildSubmodule(); // ✅
```

### Hooks and rate limits

The last argument of `addMethod`, `addPublication` and `addSharedPublication` configures hooks and a
rate limit:

```ts
import { createModule } from "meteor-rpc/server";
import { z } from "zod";

const server = createModule()
  .addMethod("sendCode", z.object({ email: z.email() }), sendCode, {
    rateLimit: { limit: 3, interval: 60_000 }, // needs `meteor add ddp-rate-limiter`
    hooks: {
      onBeforeResolve: [({ parsed, userId }) => console.log("before", parsed, userId)],
      onAfterResolve: [({ result }) => console.log("after", result)],
      onErrorResolve: [({ error, name }) => console.error(name, error)],
    },
  })
  .build();

declare function sendCode(input: { email: string }): Promise<void>;
```

Hooks take one context object. After the `onErrorResolve` hooks run, the error is re-thrown to the
caller.

### `createCaller`

Use `createCaller` to call another module's methods from server code, for example from a resolver:

```ts
import { Meteor } from "meteor/meteor";
import { createCaller, createModule } from "meteor-rpc/server";
import { z } from "zod";
import { Tasks } from "/imports/api/tasks";

export const users = createModule("users")
  .addMethod("isAdmin", z.object({ id: z.string() }), async ({ id }) => id === "admin")
  .buildSubmodule();

export const tasks = createModule("tasks")
  .addMethod("clear", z.void(), async (_input, { userId }) => {
    const isAdmin = await createCaller(users).isAdmin({ id: userId ?? "" });
    if (!isAdmin) throw new Meteor.Error("not-authorized");
    return Tasks.removeAsync({});
  })
  .buildSubmodule();
```

Calls go through `Meteor.callAsync`, so they are validated and run the middlewares and hooks, with
the current method's `userId`.

- Pass another module (a `buildSubmodule()` result) or, outside the modules, the root router.
  TypeScript can't infer a module whose type refers to itself.
- When modules import each other, create the caller inside the resolver, as above.
- Rate limits only apply to calls from clients, and outside a method or publication `userId` is
  `null`.

## Using in the client

Create the client once, for example in `imports/api/client.ts`, and import only the type of the
server. Every method is a function returning a promise:

```ts
import { createClient } from "meteor-rpc/client"; // or "meteor-rpc" for the React hooks
import type { Server } from "/imports/api/server";

const api = createClient<Server>();

const pong = await api.ping(); // "pong"
await api.tasks.add({ title: "Write docs" });
```

Errors are thrown:

- A `Meteor.Error` thrown on the server reaches the client unchanged.
- Any other error arrives as "Internal server error".
- Invalid input throws `Meteor.Error("validation-error")` with the issues in `details`.

```ts
import { isValidationError } from "meteor-rpc";

try {
  await api.users.signup({ email: "not-an-email", password: "123" });
} catch (error) {
  if (!isValidationError(error)) throw error;
  for (const issue of error.details) console.log(issue.path.join("."), issue.message);
}
```

Without React (Blaze, Vue, scripts), subscribe with `api.x.subscribe(input, callbacks)` and read the
documents with `api.x.collection(input)` inside a reactive computation.

## React focused API

The React client wraps TanStack Query and Meteor subscriptions. Above the components that use the
hooks you need a `QueryClientProvider`, a `<Suspense>` boundary and an error boundary.

### `method.useQuery` and `method.useSuspenseQuery`

`useQuery` is TanStack Query's
[`useQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery): it doesn't
suspend, so `data` is `undefined` while it loads. `useSuspenseQuery` uses
[`useSuspenseQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseQuery):
it suspends, and `data` is always defined. Both take TanStack Query's options as the second argument.

```tsx
import { api } from "/imports/api/client";

export function Profile({ id }: { id: string }) {
  const { data: user } = api.users.get.useSuspenseQuery({ id }); // suspends
  const { data: stats, isPending } = api.users.stats.useQuery({ id }, { staleTime: 60_000 });

  return (
    <p>
      {user.name}: {isPending ? "…" : `${stats?.posts} posts`}
    </p>
  );
}
```

::: tip
Prefer `useQuery` to always suspend? Create the client with `{ suspense: true }`: every `useQuery`
then behaves as `useSuspenseQuery`, so its `data` is always defined.

```ts
import { createClient } from "meteor-rpc";
import type { Server } from "/imports/api/server";

export const api = createClient<Server>({ suspense: true });
```

:::

### `method.useMutation`

It uses TanStack Query's
[`useMutation`](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation) to
call the method. Invalidate the queries a mutation changes with `queryKey`:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { api } from "/imports/api/client";

export function Rename({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const rename = api.users.rename.useMutation({
    onSuccess: () => queryClient.invalidateQueries({ queryKey: api.users.get.queryKey({ id }) }),
  });

  return (
    <button type="button" disabled={rename.isPending} onClick={() => rename.mutate({ id, name: "Ada" })}>
      Rename
    </button>
  );
}
```

### `publication.usePublication`

`usePublication` subscribes to a publication, suspends until it is ready, and re-renders when the
documents change. Components using the same publication with the same input share one
subscription.

```tsx
import { api } from "/imports/api/client";

export function Messages({ roomId }: { roomId: string }) {
  // `messages` is live: it updates when documents are added, changed or removed
  const { data: messages } = api.chat.messages.usePublication({ roomId });

  return (
    <ul>
      {messages.map((message) => (
        <li key={message._id}>{message.text}</li>
      ))}
    </ul>
  );
}
```

For a publication made with `addPublication`, it returns `{ data, collection }`. For a shared
publication, `{ data, collections }`, keyed like the resolver's return value: `data.room`,
`data.messages`.

## Examples

- [`examples/basic`](https://github.com/Grubba27/meteor-rpc/tree/main/examples/basic), a complete
  Meteor 3 app using this package, with tests against real Meteor
- [chat-app](https://github.com/Grubba27/testing-meteor-rpc) that uses this package (1.x) to create a chat-app
- [askme](https://github.com/fredmaiaarantes/askme) that uses this package (1.x) to create a Q&A app, you can check it live [here](https://askmeaquestion.meteorapp.com/)

The package also ships agent skills for coding assistants:
`node_modules/meteor-rpc/skills/meteor-rpc` (writing methods, publications and React code) and
`node_modules/meteor-rpc/skills/migrate-to-v2` (upgrading from 1.x).

## Known issues

- **"Invalid hook call" or "No QueryClient set".** Two copies of React or TanStack Query are
  installed. Run `meteor npm ls react @tanstack/react-query` and dedupe them.
- **`Method 'x' not found`.** The file that calls `build()` must be imported on the server, and
  every submodule must be added to the root module with `addSubmodule`.
- **`` `rateLimit` needs the ddp-rate-limiter package ``.** Run `meteor add ddp-rate-limiter`.
- If you use the `refapp:meteor-typescript` package and the build fails with
  `The "data" argument must be of type string … Received null`, remove it and use Meteor's
  `typescript` package instead.

More answers are in the package's
[troubleshooting guide](https://github.com/Grubba27/meteor-rpc/blob/main/docs/troubleshooting.md).
If it is still not working, please open an issue in the [repo](https://github.com/Grubba27/meteor-rpc).
