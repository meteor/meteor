# Deployment and Monitoring

After reading this guide, you'll know:

1. What to consider before you deploy a Meteor application.
2. How to deploy to common Meteor hosting environments.
3. How to design a deployment process to make sure your application's quality is maintained.
4. How to monitor user behavior with analytics tools.
5. How to monitor your application.
6. How to make sure your site is discoverable by search engines.

## Deploying Meteor Applications

Once you've built and tested your Meteor application, you need to put it online to show it to the world. Deploying a Meteor application is similar to deploying any other websocket-based Node.js app, but is different in some of the specifics.

Deploying a web application is fundamentally different from releasing most other kinds of software, in that you can deploy as often as you'd like to. You don't need to wait for users to do something to get the new version of your software because the server will push it right at them.

However, it's still important to test your changes thoroughly with a good process of Quality Assurance (QA). Although it's easy to push out fixes to bugs, those bugs can still cause major problems to users and even potentially data corruption!

::: danger Never use `--production` flag to deploy!
`--production` flag is purely meant to simulate production minification, but does almost nothing else. This still watches source code files, exchanges data with package server and does a lot more than just running the app, leading to unnecessary computing resource wasting and security issues. Please don't use `--production` flag to deploy!
:::

### Deployment environments

In web application deployment it's common to refer to three runtime environments:

1. **Development.** This refers to your machine where you develop new features and run local tests.
2. **Staging.** An intermediate environment that is similar to production, but not visible to users of the application. Can be used for testing and QA.
3. **Production.** The real deployment of your app that your customers are currently using.

The idea of the staging environment is to provide a non-user-visible test environment that is as close as possible to production in terms of infrastructure. It's common for issues to appear with new code on the production infrastructure that don't happen in a development environment. A very simple example is issues that involve latency between the client and server---connecting to a local development server with tiny latencies, you just may never see such an issue.

For this reason, developers tend to try and get staging as close as possible to production. This means that all the steps we outline below about production deployment, should, if possible, also be followed for your staging server.

### Environment variables and settings

There are two main ways to configure your application outside of the code of the app itself:

1. **Environment variables.** This is the set of `ENV_VARS` that are set on the running process.
2. **Settings.** These are in a JSON object set via either the `--settings` Meteor command-line flag or stringified into the `METEOR_SETTINGS` environment variable.

Settings should be used to set environment (i.e. staging vs production) specific things, like the access token and secret used to connect to Google. These settings will not change between any given process running your application in the given environment.

Environment variables are used to set process-specific things, which could conceivably change for different instances of your application's processes. A list of environment variables can be found in the [CLI documentation](/cli/environment-variables).

A final note on storing these settings: It's not a good idea to store settings in the same repository where you keep your app code. Read about good places to put your settings in the [Security article](/tutorials/security/security#api-keys).

## Other considerations

There are some other considerations that you should make before you deploy your application to a production host. Remember that you should if possible do these steps for both your production *and* staging environments.

### Domain name

What URL will users use to access your site? You'll probably need to register a domain name with a domain registrar, and setup DNS entries to point to the site (this will depend on how you deploy, see below).

### SSL Certificate

It's always a good idea to use SSL for Meteor applications (see the [Security Article](/tutorials/security/security#ssl) to find out why). Once you have a registered domain name, you'll need to generate an SSL certificate with a certificate authority for your domain. Many hosting providers offer free SSL certificates through Let's Encrypt.

### CDN

It's not strictly required, but often a good idea to set up a Content Delivery Network (CDN) for your site. A CDN is a network of servers that hosts the static assets of your site (such as JavaScript, CSS, and images) in numerous locations around the world and uses the server closest to your user to provide those files in order to speed up their delivery.

For Meteor, we recommend using a CDN with "origin" support (like CloudFront), which means that instead of uploading your files in advance, the CDN automatically fetches them from your server. You put your files in `public/`, and when your user asks the CDN for a file, the CDN fetches it from your server behind the scenes.

To get Meteor to use the CDN for your JavaScript and CSS bundles, call `WebAppInternals.setBundledJsCssPrefix("https://mycdn.com")` on the server. This will also take care of relative image URLs inside your CSS files.

For all your files in `public/`, change their URLs to point at the CDN. You can use a helper like `assetUrl`:

```js
// Register a global helper for asset URLs
Template.registerHelper("assetUrl", (asset) => {
  return "https://mycdn.com/" + asset;
});
```

```html
<img src="{{assetUrl 'cats.gif'}}">
```

#### CDNs and webfonts

If you are hosting a webfont as part of your application and serving it via a CDN, you may need to configure the served headers for the font to allow cross-origin resource sharing:

```js
import { WebApp } from 'meteor/webapp';

WebApp.rawHandlers.use(function(req, res, next) {
  if (req._parsedUrl.pathname.match(/\.(ttf|ttc|otf|eot|woff|woff2|font\.css|css)$/)) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  next();
});
```

## Deployment options

Meteor is an open source platform, and you can run the apps that you make with Meteor anywhere just like regular Node.js applications. But operating Meteor apps *correctly*, so that your apps work for everyone, can be tricky if you are managing your infrastructure manually.

### Galaxy Cloud (Recommended)

[Galaxy Cloud](https://galaxycloud.app) is a service built specifically to run Meteor apps. It's the easiest way to operate your app with confidence.

Galaxy is a distributed system that runs on cloud infrastructure. If you understand what it takes to run Meteor apps correctly and how Galaxy works, you'll come to appreciate Galaxy's value, and that it will save you a lot of time and trouble.

In order to deploy to Galaxy, you'll need to sign up for an account and separately provision a MongoDB database (see below).

Once you've done that, deployment is straightforward. You need to add some environment variables to your settings file to point it at your MongoDB, and you can deploy with:

```bash
DEPLOY_HOSTNAME=us-east-1.galaxy.meteor.com meteor deploy your-app.com --settings production-settings.json
```

You can also log into the Galaxy UI to manage your applications, monitor the number of connections and resource usage, view logs, and change settings.

### Meteor Up

[Meteor Up](https://meteor-up.com), often referred to as "mup", is a third-party, open-source tool that can be used to deploy Meteor applications to any online server over SSH. It's essentially a way to automate the manual steps of using `meteor build` and putting that bundle on your server.

You can obtain a server running Ubuntu or Debian from many generic hosting providers and Meteor Up can SSH into your server with the keys you provide in the config. You can get started with the [tutorial](https://meteor-up.com/getting-started.html).

One of its plugins, [mup-aws-beanstalk](https://github.com/zodern/mup-aws-beanstalk/) deploys Meteor Apps to AWS Elastic Beanstalk instead of a server. It supports autoscaling, load balancing, and zero downtime deploys.

### Docker

To orchestrate your own container-based deployment there are existing base images to consider:

- [Official Node.js images](https://hub.docker.com/_/node) - Use as a base for your custom Dockerfile
- [meteor/meteor-base](https://hub.docker.com/r/meteor/meteor-base) - Official Meteor base images

Here's a basic Dockerfile example for a Meteor 3 application:

```dockerfile
# Build stage
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ git

WORKDIR /app
COPY . .

# Install Meteor
RUN curl https://install.meteor.com/ | sh

# Build the application
RUN meteor npm install --production
RUN meteor build --directory /build --server-only

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built application
COPY --from=builder /build/bundle .

# Install production dependencies
WORKDIR /app/programs/server
RUN npm install --production

WORKDIR /app

ENV PORT=3000
ENV ROOT_URL=http://localhost:3000

EXPOSE 3000

CMD ["node", "main.js"]
```

### Custom deployment

If you want to figure out your hosting solution completely from scratch, the Meteor tool has a command `meteor build` that creates a deployment bundle that contains a plain Node.js application. Any npm dependencies must be installed before issuing the `meteor build` command to be included in the bundle.

**NOTE:** It's important that you build your bundle for the correct architecture:

```bash
# for example if deploying to a Ubuntu linux server:
npm install --production
meteor build /path/to/build --architecture os.linux.x86_64
```

This will provide you with a bundled application `.tar.gz` which you can extract and run without the `meteor` tool. The environment you choose will need the correct version of Node.js and connectivity to a MongoDB server.

To find out which version of Node you should use, run `meteor node -v` in the development environment, or check the `.node_version.txt` file within the bundle. For Meteor 3.x, you'll need Node.js 20.x.

::: warning
If you use a mis-matched version of Node when deploying your application, you will encounter errors!
:::

You can then run the application by invoking `node` with environment variables:

```bash
cd my_build_bundle_directory
(cd programs/server && npm install)
MONGO_URL=mongodb://localhost:27017/myapp ROOT_URL=http://my-app.com PORT=3000 node main.js
```

- `ROOT_URL` is the base URL for your Meteor project
- `PORT` is the port at which the application is running
- `MONGO_URL` is a [Mongo connection string URI](https://docs.mongodb.com/manual/reference/connection-string/)

## MongoDB options

When you deploy your Meteor server, you need a `MONGO_URL` that points to your MongoDB database. You can either use a hosted MongoDB service or set up and run your own MongoDB server. We recommend using a hosted service, as the time saved and peace of mind are usually worth the cost.

### Hosted service (Recommended)

There are a variety of services out there:

- [MongoDB hosted by Galaxy Cloud](https://galaxycloud.app/) - MongoDB hosting provided by Galaxy Cloud
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) - The official MongoDB cloud service
- [DigitalOcean Managed Databases](https://www.digitalocean.com/products/managed-databases-mongodb)
- [AWS DocumentDB](https://aws.amazon.com/documentdb/) (MongoDB compatible)

When selecting a hosted MongoDB service for production, consider:

- Supports the MongoDB version you wish to run
- Storage Engine Support (WiredTiger is default since Meteor 1.4)
- Support for Replica Sets & Oplog tailing
- Monitoring & Automated alerting
- Continuous backups & Automated snapshots
- Access Control, IP whitelisting, and VPC Peering
- Encryption of data in-flight and at-rest
- Cost and pricing granularity
- Instance size & options

### Self-hosted

You can install MongoDB on your own server. As you can see from the above section, there are many aspects of database setup and maintenance that you have to take care of. For the best performance, choose a server with an SSD large enough to fit your data and with enough RAM to fit the working set (indexes + active documents) in memory.

## Deployment process

Although it's much easier to deploy a web application than release most other types of software, that doesn't mean you should be cavalier with your deployment. It's important to properly QA and test your releases before you push them live.

A typical release process looks like:

1. Deploy the new version of the application to your staging server.
2. QA the application on the staging server.
3. Fix any bugs found in step 2 and repeat.
4. Once you are satisfied with the staging release, release the *exact same* version to production.
5. Run final QA on production.

Steps 2 and 5 can be time-consuming, especially if you are aiming to maintain a high level of quality. That's why it's a great idea to develop a suite of acceptance tests (see our [Testing Article](/tutorials/testing/testing) for more on this).

### Continuous deployment

Continuous deployment refers to the process of deploying an application via a continuous integration tool, usually when some condition is reached (such as a git push to the `main` branch).

Here's an example GitHub Actions workflow for deploying to Galaxy:

```yaml
name: Deploy to Galaxy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22.x

      - name: Install Meteor
        run: curl https://install.meteor.com/ | sh

      - name: Deploy to Galaxy
        env:
          METEOR_SESSION_FILE: ${{ secrets.METEOR_SESSION_FILE }}
        run: |
          echo "$METEOR_SESSION_FILE" > meteor-session.json
          METEOR_SESSION_FILE=meteor-session.json \
          DEPLOY_HOSTNAME=us-east-1.galaxy.meteor.com \
          meteor deploy your-app.com --settings settings.json
```

### Rolling deployments and data versions

It's important to understand what happens during a deployment, especially if your deployment involves changes in data format (and potentially data migrations, see the [Collections Article](/tutorials/collections/collections#migrations)).

When you are running your app on multiple servers or containers, it's not a good idea to shut down all of the servers at once and then start them all back up again. This will result in more downtime than necessary, and will cause a huge spike in CPU usage when all of your clients reconnect again at the same time. Modern hosting platforms stop and re-start containers one by one during deployment.

If the new version involves different data formats in the database, then you need to be careful about how you step through versions to ensure that all the versions that are running simultaneously can work together.

## Monitoring users via analytics {#analytics}

It's common to want to know which pages of your app are most commonly visited, and where users are coming from. Here's a setup using Google Analytics:

```js
// client/analytics.js
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

// Initialize Google Analytics
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', 'G-XXXXXXXXXX'); // Your GA4 Measurement ID

// Track page views on route changes
FlowRouter.triggers.enter([() => {
  gtag('event', 'page_view', {
    page_path: FlowRouter.current().path,
    page_title: document.title
  });
}]);
```

Add the Google Analytics script to your `<head>`:

```html
<head>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
</head>
```

You may want to track non-page change related events (for instance method calls) also:

```js
export const updateText = {
  async run({ todoId, newText }) {
    if (Meteor.isClient) {
      gtag('event', 'todos_update_text', {
        todo_id: todoId,
        custom_parameter: 'value'
      });
    }

    // ... method implementation
  }
};
```

## Monitoring your application

When you are running an app in production, it's vitally important that you keep tabs on the performance of your application and ensure it is running smoothly.

### Understanding Meteor performance

Although a host of tools exist to monitor the performance of HTTP request-response based applications, the insights they give aren't necessarily useful for a connected client system like a Meteor application. While slow HTTP response times would be a problem, there are many kinds of issues that won't be surfaced by traditional monitoring tools.

### APM (Application Performance Monitoring)

If you really want to understand the ins and outs of running your Meteor application, you should use an Application Performance Monitoring (APM) service:

- [Monti APM](https://montiapm.com/) - Designed specifically for Meteor
- [Meteor Elastic APM](https://github.com/Meteor-Community-Packages/meteor-elastic-apm) - Integration with Elastic APM
- [Datadog APM](https://www.datadoghq.com/product/apm/) - General-purpose APM with custom integrations

These APMs operate by taking regular client and server side observations of your application's performance and reporting them back to a monitoring server.

#### Method and Publication Latency

Rather than monitoring HTTP response times, in a Meteor app it makes far more sense to consider DDP response times. The two actions your client will wait for in terms of DDP are *method calls* and *publication subscriptions*. APM tools help you discover which of your methods and publications are slow and resource intensive.

#### Livequery Monitoring

A key performance characteristic of Meteor is driven by the behavior of livequery, the technology that allows your publications to push changing data automatically in realtime. In order to achieve this, livequery needs to monitor your MongoDB instance for changes (by tailing the oplog) and decide if a given change is relevant for the given publication.

If the publication is used by a lot of users, or there are many changes to be compared, then these livequery observers can do a lot of work. APM tools can help you understand your livequery usage and optimize accordingly.

## Enabling SEO

If your application contains a lot of publicly accessible content, then you probably want it to rank well in Google and other search engines' indexes. As most webcrawlers have limited support for client-side rendering, it's better to render the site on the server and deliver it as HTML.

### Server-Side Rendering

For React applications, you can use the [`server-render`](/packages/server-render) package to implement server-side rendering:

```js
import { onPageLoad } from 'meteor/server-render';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '/imports/ui/App';

onPageLoad(sink => {
  const html = renderToString(<App />);
  sink.renderIntoElementById('react-root', html);
});
```

### Prerendering Services

You can also use prerendering services like [Prerender.io](https://prerender.io) to serve pre-rendered HTML to search engine crawlers:

```js
import { WebApp } from 'meteor/webapp';
import prerender from 'prerender-node';

WebApp.connectHandlers.use(
  prerender.set('prerenderToken', 'YOUR_TOKEN')
);
```

### Setting Page Metadata

To set `<title>` tags and other `<head>` content for SEO, you can use React Helmet or similar packages:

```jsx
import { Helmet } from 'react-helmet';

function ProductPage({ product }) {
  return (
    <>
      <Helmet>
        <title>{product.name} - My Store</title>
        <meta name="description" content={product.description} />
        <meta property="og:title" content={product.name} />
        <meta property="og:description" content={product.description} />
      </Helmet>
      {/* Page content */}
    </>
  );
}
```
