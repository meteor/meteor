---
title: Deployment, Monitoring and Analytics
---

After reading this guide, you'll know:

1. What you need to know before you deploy a Meteor application
2. How to deploy to some common Meteor hosting environments
3. How to design a deployment process to make sure your application's quality is maintained
4. How to monitor user behaviour with analytics tools
5. How to monitor your application with Kadira

## Deploying Meteor Applications

Once you've built and tested your Meteor application, you need to put it online to show it to the world. In some ways, deploying a Meteor application is not so different to deploying any other web applications, whilst in others it can be.

Deploying a web application is fundamentally different to releasing most other kinds of software, in that you can deploy as often as you'd like to---you don't need to wait for users to do something to get the new version of your software---the server will push it right at them.

However, it's still important to test your changes throughly with a good process of Quality Assurance (QA). Although it's easy to push out fixes to bugs, those bugs can still cause major problems to users and even potentially data corruption!

### Deployment environments

In web deployment it's common to refer to the different environments that you may deploy to. After building your app in the "development" environment, you typically first deploy it to a "staging" environment ("stage" the app), then after testing, deploy it for real to "production".

The idea of the staging environment is to provide a non-user visibile test environment that is as close as possible to production in terms of infrastructure. It's common for issues to appear with new code on the production infrastructure that just don't occur in a development environment. A very simple example is issues that involve latency between the client and server---connecting to a local development server with tiny latencies, you just may never see such an issue.

For this reason, developers tend to try and get staging as close as possible to production; so all the steps we outline below should, if possible, be followed for staging also.

### Meteor Environment variables + Settings

There are two main ways to configure your application outside of the code of the app itself. They are the **environment variables** (the set of `ENV_VARS` that are set on the running process), and the **settings**, which is a JSON object set via either the `--settings` command-line flag or stringified in the `METEOR_SETTINGS` environment var.

Settings should be used to set environment (i.e. staging vs production) specific things, like the access token and secret used to connect to Google. These settings will not change between any given process running your application in the given environment.

Environment vars are used to set process specific things, which could conceivably change for different instances of your application's processes. For instance, you could set a different `MONGO_URL` for each process to preference different secondaries for reads in a highly scaled situation.

A final note on storing these settings: As noted in the {% link_to 'security' 'Security Article' %}, it's not a good idea to store settings in your code repository, instead a more secure place is preferred.

## Deployment errata

There are some other considerations that you should make before you deploy your application to a production host. Remember that you should if possible do this step for both your production *and* staging environments.

### Domain name

What URL will users use to access your site? You'll probably need to register a domain name with a domain registrar, and setup DNS entries to point to the site (this will depend on how you deploy, see below). If you deploy to the free Meteor servers, you can use a `x.meteor.com` domain while you are testing the app.

### SSL Certificate

It's always a good idea to use SSL for Meteor Applications (see the {% link_to 'security' 'Security Article'} for a discussion of why). Once you have a registered domain name, you'll need to generate an SSL certificate with a certificate authority for your domain.

### CDN

It's not strictly required, but often a good idea to setup a Content Delivery Network (CDN) for your site. A CDN is a proxy that sits in front of the larger assets in your site (such as JS and CSS files, as well as potentially images) and caches copies of those files in locations that are closer to the location of the user. So for instance, although the actual web server for your application is on the East Coast of the USA, if a user is in Australia, a CDN could host a copy of the JavaScript of the site within Australia or even in the city the user is in. This has huge benefits for the initial loading time for your site.


 You want to put your CDN in front of the static assets that Meteor knows about. You can use `WebAppInternals.setBundledJsCssPrefix(DNS_HOSTNAME)` to set a prefix that applies to all of the bundled JS and CSS assets that the Meteor app serves. In particular, this means if you have relative image URLs inside your CSS files, they will also be served from the CDN.

If you are following the above approach, you may also want to manually write out the CDN's hostname whenever you put an image/other asset URL in your application's code, probably via a `image_url()`-style helper.

A second approach is to place the CDN completely in front of your site. In this scenario you point your DNS entry (e.g. `www.example.com`) directly at the CDN, so the initial boilerplate for the Meteor application is proxied by the CDN from a hidden 'real' URL (say `www-backend.example.com`). In this way, any asset referenced in your application will be served by the CDN.

XXX: do we actually know anyone that has done this? What domains are typically used?

## Deploying

There are many options on where to deploy your Meteor application but here are some prominent options.

### Meteor's free hosting

If you are still developing your application and want to see how it behaves online, or share in with a small group without needing a full production setup, you can get started quickly on the free hosting available at `meteor.com`.

Deploying is simple, simply type:

```bash
meteor deploy your-app.meteor.com
```

This will bundle your application from the current directory, upload it, and serve it from https://your-app.meteor.com. Along the way it'll provision you with a MongoDB database and mail setup and configure (via the ENV) your app to run. Note that the service is pretty limited however

XXX: insert details on how meteor.com is limited.

#### Managing your meteor.com app

There are few handy tips for managing your deployed application. To deploy with a `settings.json` file, use:

```bash
meteor deploy your-app.meteor.com --settings settings.json
```

To delete the app, you can type:

```bash
meteor deploy --delete your-app.meteor.com
```

To allow others to deploy the app, you can add them to the authorized user list with:

```bash
meteor authorized your-app.meteor.com --add <user-or-organization>
```

You can view the latest logs with

```bash
meteor logs your-app.meteor.com
```

Finally, if you want to access the mongo database for your app directly, you can use

```bash
meteor mongo your-app.meteor.com
```

### Deploying with Meteor Up

[Meteor Up](https://github.com/kadirahq/meteor-up) (mup) is an open source tool that's used to deploy Meteor application to any online server over SSH. 

To use mup, you need to install the `mup` tool via `npm`.

```bash
npm install -g mup
```

Once you've installed the command, you can initialize your project with `mup init`, which will create a `mup.json` file which you can use to configure your setup. You can read the [finer details here](https://github.com/kadirahq/meteor-up#example-file), but essentially you need to list the servers you would like to install to as well as some options on exactly how to set them up.

To list those servers you'll first need to obtain some! A good option is Digital Ocean(https://www.digitalocean.com), which will provide a Virtual Private Server for a very reasonable price. You'll need to ensure that Ubuntu or Debian is installed on the machine and mup can SSH into your server with the keys you provide in the config.

Once you've configured mup, you can get your servers installed with

```bash
mup setup
```

Once you've done so, you can redeploy each time with:

```bash
mup deploy
```

You can also [watch this video](https://www.youtube.com/watch?v=WLGdXtZMmiI) for a more complete walkthrough on how to do it.

### Deploying to Modulus

[Modulus](https://modulus.io) is a container based hosting service that's an affordable way to host Meteor applications without needing to deal with managing your own servers directly. You can use them to host your MongoDB database and deploy your Meteor application using their commandline tool.

Read more about using Meteor with Modulus [here](http://help.modulus.io/customer/portal/articles/1647770-using-meteor-with-modulus).

Note however that in order use oplog tailing (highly recommended for performance), you'll need to either get a dedicated database hosting service from Modulus or use a different MongoDB provider (see below).

### Deploying to Galaxy

Another option is to deploy to Galaxy, Meteor's paid hosting service. In order to deploy to Galaxy, you'll need to sign up for an account [here](https://www.meteor.com/why-meteor/pricing?gclid=CIqstOv3uckCFYKWvAod338FGw), and separately provision a MongoDB database (see below).

Once you've done that, you can [deploy to Galaxy](https://galaxy.meteor.com/help/deploying-to-galaxy) almost as easily as you can to Meteor's free servers. You just need to [add some environment variables to your settings file](https://galaxy.meteor.com/help/setting-environment-variables) to point it at your MongoDB, and you can deploy with:

```bash
DEPLOY_HOSTNAME=galaxy.meteor.com meteor deploy your-app.com --settings production-settings.json
```

In order for galaxy to work with your custom domain (`your-app.com` in this case), you need to [set up your DNS to point at Galaxy](https://galaxy.meteor.com/help/configuring-dns). Once you've done this, you should be able to reach your site from a browser.

You can also log into the Galaxy UI at https://galaxy.meteor.com. Once there you can manage your applications, monitor the number of connections and resource usage, view logs, and change settings. 

[ss]

If you are following our advice, you'll probably want to [setup SSL](https://galaxy.meteor.com/help/using-ssl) on your Galaxy application with the certificate and key for your domain.

Once you are setup with Galaxy, deployment is simple (just re-run the `meteor deploy` command above), and scaling is even easier---simply log into galaxy.meteor.com, and scale instantly from there.

[ss]

#### MongoDB hosting services to use with Galaxy

If you are using Galaxy (or need a production quality, managed MongoDB for one of the other options listed here), it's usually a good idea to use a [MongoDB hosting provider](https://galaxy.meteor.com/help/configuring-mongodb). There are a variety of options out there, but a good choice is [Compose](compose.io). The main things to look for are support for oplog tailing, and a presence in the us-east-1 AWS region.

## Deployment Process

Although it's much easier to deploy a web application than release most other types of software, that doesn't mean you should be cavalier with your deployment. It's important to properly QA and test your releases before you push them live, to ensure that users don't have a bad experience, or even worse, data get corrupted.

It's a good idea to have a release process that you follow in releasing your application. Typically that process looks something like:

1. Deploy the new version of the application to your staging server.
2. QA the application on the staging server.
3. Fix any bugs found in step 2. and repeat.
4. Once you are satisfied with the staging release, release the *exact same* version to production.
5. Run final QA on production.

Steps 2. and 5. can be quite time-consuming, especially if you are aiming to maintain a high level of quality in your application. That's why it's a great idea to develop a suite of acceptance tests (see our {% link_to 'testing' 'Testing Article'} for more on this). To take things even further, you could run a load/stress test against your staging server on every release.

### Rolling deployments and data versions

It's important to understand what happens during a deployment, especially if your deployment involves changes in data format (and potentially data migrations, see the {% link_to 'collections' 'Collections Article'}).

Depending on where your app is deployed and the number of application processes you have running, things will be different, but if you are deployed in a scaled way to Galaxy, there'll be a period where a number of containers are running the old version, and a number the new, as users are migrated smoothly across to the new version of your app.

[ss]

If the new version involves a different type of data, then you need to be a little more careful about how you step through versions to ensure that all the versions that are deployed simultaneously at all times. You can read more about how to do this in the collections article.

5. Monitoring users via analytics

### XXX: we have this in the routing chapter. Where does it want to live?


6. Monitoring your application via APM
  1. Understanding the typical performance profile of a Meteor application
    1. observers x mutations ~== total CPU usage
    2. When the CPU is pegged, many other problems can occur that aren't necessarily related to the root problem.
    3. Finding observer leaks
    4. Using CPU detective to find out which observers are guilty [is this a thing yet avi?]
  2. Using Galaxy's APM
    1. Metrics
    2. Logging
  3. Using Kadira
    1. What Kadira is
    2. Monitoring resource usage
    3. Monitoring Method + Publication latency -- and what this means.
      1. Over time
      2. Getting traces to help discover bottlenecks
    4. Monitoring observer re-use
