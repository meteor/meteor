# Sharing Code and Data Between Meteor Apps

After reading this article, you'll know:

1. How to keep customer and admin interfaces in separate Meteor applications.
2. How to share collections and selected domain code through a local Meteor package.
3. How to connect both applications to the same MongoDB database without sharing their entire server API.
4. Which authentication, deployment, and schema concerns remain separate.

A customer application and an admin application often need different user interfaces, access rules, release schedules, or scaling profiles while working with the same data. Meteor applications can live in one repository, share selected code, and connect to the same MongoDB database.

This is a **multi-app architecture**. It is not necessarily a microservice architecture: sharing a database and domain package couples the applications at the data model. That trade-off is often reasonable for an admin/customer split, but it should be explicit.

## Repository layout

Keep each Meteor application as an independent app root with its own `.meteor`, `package.json`, client entry point, and server entry point. Put shared Meteor-specific code in a local package outside both apps:

```text
store/
  apps/
    customer/
      .meteor/
      client/
      imports/
      server/
      package.json
    admin/
      .meteor/
      client/
      imports/
      server/
      package.json
  packages/
    store-models/
      package.js
      index.js
      orders.js
```

You can create the two app roots with:

```bash
meteor create --bare apps/customer
meteor create --bare apps/admin
```

Each app can now add packages, dependencies, settings, and UI code independently.

## Share collections with a local package

A local Meteor package is a good boundary for code that depends on Meteor packages such as `mongo`. Unlike linking an entire `imports` directory, it gives the shared code explicit entry points and dependencies.

Define the package metadata:

```js
// packages/store-models/package.js
Package.describe({
  name: 'store:models',
  version: '0.0.1',
  summary: 'Collections shared by the customer and admin apps'
});

Package.onUse((api) => {
  api.versionsFrom('3.0');
  api.use(['ecmascript', 'mongo']);
  api.mainModule('index.js');
});
```

Define and export a collection from the package:

```js
// packages/store-models/orders.js
import { Mongo } from 'meteor/mongo';

export const Orders = new Mongo.Collection('orders');
```

```js
// packages/store-models/index.js
export { Orders } from './orders.js';
```

Set [`METEOR_PACKAGE_DIRS`](/cli/environment-variables#meteor-package-dirs) whenever you run a Meteor command so each app can find the shared package. Then add it to both apps:

```bash
cd apps/customer
METEOR_PACKAGE_DIRS=../../packages meteor add store:models

cd ../admin
METEOR_PACKAGE_DIRS=../../packages meteor add store:models
```

Both apps can now import the same collection declaration:

```js
import { Orders } from 'meteor/store:models';
```

The shared package ensures that both codebases use the MongoDB collection named `orders`. The records are shared only when both apps also connect to the same database.

::: tip
For framework-neutral utilities, types, or validation code, an [npm workspace](/packages/5.writing-npm-packages#using-npm-workspaces) can be a better fit. Use a local Meteor package when the shared code depends on Meteor packages or needs separate client and server entry points.
:::

### Keep the shared boundary narrow

Share the smallest stable surface that both apps need. Good candidates include:

- collection declarations and indexes;
- schemas, enums, and shared types;
- pure validation and domain functions; and
- server services that must enforce the same rule in both applications.

Keep these concerns in each application unless they are intentionally identical:

- UI components, routes, and startup code;
- Methods, publications, and HTTP endpoints;
- authentication and audience-specific authorization;
- settings, secrets, and integrations; and
- background jobs and other side effects.

Use relative imports inside the shared package. An absolute app import such as `/imports/api/payments` assumes every consuming app has the same directory and defeats the package boundary.

Symbolic links can also expose a shared directory to both apps, but local packages are more explicit, work across operating systems, and make accidental client/server imports easier to avoid. Do not link one app's entire `imports` directory into the other app.

## Keep each app's server API separate

Sharing a collection does not require sharing the ways clients may access it. The customer app can expose customer operations:

```js
// apps/customer/imports/api/orders/server/methods.js
import { check } from 'meteor/check';
import { Meteor } from 'meteor/meteor';
import { Orders } from 'meteor/store:models';

Meteor.methods({
  async 'orders.create'({ itemIds }) {
    check(itemIds, [String]);

    if (!this.userId) {
      throw new Meteor.Error('orders.create.notLoggedIn');
    }

    return Orders.insertAsync({
      customerId: this.userId,
      itemIds,
      status: 'pending',
      createdAt: new Date()
    });
  }
});
```

The admin app can expose a different operation over the same data:

```js
// apps/admin/imports/api/orders/server/methods.js
import { check } from 'meteor/check';
import { Meteor } from 'meteor/meteor';
import { Orders } from 'meteor/store:models';
import { assertAdmin } from '../../users/server/security.js';

Meteor.methods({
  async 'admin.orders.approve'({ orderId }) {
    check(orderId, String);
    await assertAdmin(this.userId);

    return Orders.updateAsync(orderId, {
      $set: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: this.userId
      }
    });
  }
});
```

Apply the same separation to publications. A customer publication should select only that customer's orders and safe fields, while an admin publication can provide a broader view only after server-side admin authorization. A separate admin UI is not itself an authorization boundary.

## Connect both apps to the same database

Without `MONGO_URL`, each `meteor run` command starts an embedded development MongoDB for that app. By default, an app on port `3000` uses MongoDB port `3001`; an admin app on port `3100` would start a different database on port `3101`.

To share records, run a MongoDB instance that both apps can reach and give both processes the exact same `MONGO_URL`, including the database name:

```bash
# Terminal 1
cd apps/customer
METEOR_PACKAGE_DIRS=../../packages \
MONGO_URL=mongodb://127.0.0.1:27017/store \
meteor run --port 3000
```

```bash
# Terminal 2
cd apps/admin
METEOR_PACKAGE_DIRS=../../packages \
MONGO_URL=mongodb://127.0.0.1:27017/store \
meteor run --port 3100
```

When one app writes to `Orders`, the other app observes the same MongoDB collection. Reactive updates work across the processes through Meteor's database observer. See [Change Streams](/performance/change-streams-observer-driver) for production topology and configuration details.

For a quick local experiment, one app can connect to the other app's embedded MongoDB. For regular development, use a separately managed local database so stopping one Meteor process does not also stop the database used by the other.

::: warning
Sharing a database gives both server processes direct read and write access. If one application should exclusively own a domain, do not share raw collection access for that domain. Let the other app call the owner through [DDP or HTTP](/tutorials/application-structure/#sharing-data) instead.
:::

## Accounts and authorization

When both apps use the same database, they also see the same `users` collection. This lets the admin app authorize the same user records and roles used by the customer app.

It does not automatically share a browser login session. Each app has its own client connection and origin, and users may need to authenticate separately. For authenticated DDP calls between apps that share the same database, see [Sharing accounts](/tutorials/application-structure/#sharing-accounts). For browser-wide single sign-on, use an identity-provider or OAuth flow.

Every admin Method, publication, and HTTP handler must verify admin access on the server. Network restrictions and a separate admin deployment are useful additional layers, but they do not replace authorization checks.

## Coordinate deployment and schema changes

The applications are built and deployed independently, but their shared database contract must remain compatible:

- Configure the same production `MONGO_URL` in both deployments.
- Deploy backward-compatible schema changes before code that requires them.
- Keep collection indexes idempotent and decide which app owns data migrations.
- Ensure only one app owns scheduled jobs, email delivery, billing, and similar side effects unless duplicates are safe.
- Test the supported combinations when the customer and admin apps can run different versions.

In-process events, timers, and memory are not shared between the apps. If a customer write must reliably trigger admin-side work, use a durable job, a database-backed handoff, or an explicit DDP/HTTP call.

As the applications become more independent, consider splitting the shared package by domain or replacing direct database access with service APIs. That moves the design closer to independently deployable microservices, at the cost of additional operational complexity.
