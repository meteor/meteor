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


2. Other things to consider when deploying
  1. Domain names
  2. SSL certificates
  3. CDNs
    1. What they are for
    2. How they are usually used -- e.g. CloudFront (find a useful general article to link to)
3. Deployment options
  1. Deploying to .meteor.com via `meteor deploy`.
    1. How to do it
    2. Managing a deployment / deleting
    3. Accessing mongo
    4. Performance characteristics => don't use for production
  2. Deploying with MUP
    1. Description of what MUP does
    2. Link to some articles w/ example content
  3. Deploying with Modulus
    1. Description of what Modulus is
    2. Link to some articles w/ example content
  4. Deploying with Galaxy
    1. Description of Galaxy
    2. How to do it
    3. Management on the commandline
    4. The Galaxy UI -- link to galaxy docs
    5. How rolling app updates work, and why they are important
4. Deployment process
  1. Why it's important to have a deployment process (it's easy to mess up a web application deployment)
  2. The steps in getting a release to production
    1. Deploy to staging + migrate data
    2. QA on staging
    3. Fix and repeat
    4. Deploy to production + migrate
    5. Final QA
  3. Automating QA via acceptance testing
  4. Understanding what happens during a (rolling deployment)
    1. Multiple versions running concurrently
    2. Therefore you app needs to (temporarily) be resistent to both data formats
    3. How to do a 2 stage deployment to allow schema changes
5. Monitoring users via analytics
  1. It's useful to understand who is using your application
  2. Using `okgrow:analytics`
  3. A sample service -- probably GA
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
