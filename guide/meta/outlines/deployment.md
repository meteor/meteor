# Deployment, monitoring and analytics

1. Deploying a web application
  1. A web application is not necessarily like any other piece of released software
     1. Can be updated frequently
     2. Still QA is important!
  2. Deployment environments: production vs staging vs development
    1. Staging should be as close as possible to production
  3. Meteor ENV + settings
    1. Use ENV for "host specific" things -- usually just MONGO_URLs and MAIL_URLs
    2. Use settings for environment specific things, like 3rd party secrets.
    3. Settings *should not* be part of the repository (too much trust in 3rd parties). Ideally stored in some secure location.
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
