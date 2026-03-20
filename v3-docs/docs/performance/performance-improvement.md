# Performance Improvements

This guide focuses on providing you tips and common practices on how to improve performance of your Meteor app (sometimes also called scaling).

After reading this guide, you'll know:

1. How to use APM for performance monitoring
2. How to optimize publications and data loading
3. How to improve Method performance
4. MongoDB optimization strategies
5. Scaling approaches for growing applications

It is important to note that at the end of the day Meteor is a Node.js app tied closely to MongoDB, so a lot of the problems you are going to encounter are common to other Node.js and MongoDB apps. Also do note that every app is different so there are unique challenges to each, therefore practices described in this guide should be used as guiding posts rather than absolutes.

## Performance monitoring

Before any optimization can take place we need to know what is our problem. This is where APM (Application Performance Monitor) comes in.

The recommended Meteor-specific APM solution is [Monti APM](https://montiapm.com/). Unlike generic Node.js APM tools, Monti APM understands Meteor's DDP protocol, publications, methods, and livequery observers, giving you insights tailored to your Meteor app.

> **Note:** Galaxy APM (`mdg:meteor-apm-agent`) has been discontinued. If you were using it, migrate to Monti APM which provides the same Meteor-specific monitoring capabilities.

To get started, add the Monti APM agent to your Meteor app:

```bash
meteor add montiapm:agent
```

Then configure it with your Monti APM credentials. See the [Monti APM documentation](https://docs.montiapm.com/) for full setup instructions, including [getting started](https://docs.montiapm.com/getting-started) and [dashboard guides](https://docs.montiapm.com/dashboards/jobs-dashboard).

You can also choose other APM tools for Node.js (such as [Datadog](https://www.datadoghq.com/product/apm/) or [Elastic APM](https://github.com/Meteor-Community-Packages/meteor-elastic-apm)), but they will not show you Meteor-specific data like DDP response times, publication performance, and observer reuse metrics.

### Finding issues in APM

APM will start with providing you with an overview of how your app is performing. You can then dive deep into details of publications, methods, errors happening (both on client and server) and more. You will spend a lot of time in the detailed tabs looking for methods and publications to improve and analyzing the impact of your actions.

The process, for example for optimizing methods, will look like this:

1. Go to the detailed view under the Methods tab.
2. Sort the Methods Breakdown by Response Time.
3. Click on a method name in the Methods Breakdown. Assess the impact if you improve the selected method.
4. Look at the response time graph and find a trace.
5. Improve your method if you feel it is the right moment to do so.

Not every long-performing method has to be improved. Take a look at the following example:

- **methodX** - mean response time 1,515ms, throughput 100.05/min
- **methodY** - mean response time 34,000ms, throughput 0.03/min

At first glance, the 34 seconds response time can catch your attention, and it may seem that the methodY is more relevant to improvement. But don't ignore the fact that this method is being used only once in a few hours by the system administrators or scheduled cron action.

And now, let's take a look at the methodX. Its response time is evidently lower BUT compared to the frequency of use, it is still high, and without any doubt should be optimized first.

It's also absolutely vital to remember that you shouldn't optimize everything as it goes. The key is to think strategically and match the most critical issues with your product priorities.

## Publications

Publications allow for the most prominent aspect of Meteor: live data. At the same this is the most resource intensive part of a Meteor application.

Under the hood WebSockets are being used with additional abilities provided by DDP.

### Proper use of publications

Since publications can get resource intensive they should be reserved for usage that requires up-to-date, live data or that are changing frequently and you need the users to see that.

You will need to evaluate your app to figure out which situations these are. As a rule of thumb any data that are not required to be live or are not changing frequently can be fetched once via other means and re-fetched as needed, in most cases the re-fetching shouldn't be necessary.

But even before you proceed any further there are a few improvements that you can make here:

- Only get the fields you need
- Limit the number of documents you send to the client (always set the `limit` option)
- Ensure that you have set all your indexes

### Methods over publications

The first easiest replacement is to use Meteor methods instead of publications. In this case you can use the existing publication and instead of returning a cursor you will call `.fetchAsync()` and return the actual data. The same performance improvements to get the method work faster apply here, but once called it sends the data and you don't have the overhead of a publication.

```js
// Instead of a publication
Meteor.publish('allPosts', function() {
  return Posts.find({}, { limit: 20 });
});

// Use a method for one-time data loading
Meteor.methods({
  async getPosts() {
    return await Posts.find({}, { limit: 20 }).fetchAsync();
  }
});
```

What is crucial here is to ensure that your choice of a front-end framework doesn't call the method every time, but only once to load the data or when specifically needed (for example when the data gets updated due to user action or when the user requests it).

### Publication replacements

Using methods has its limitations and there are other tools that you might want to evaluate as a potential replacement:

- [Grapher](https://github.com/cult-of-coders/grapher) is a favorite answer and allows you to easily blend with GraphQL
- [Apollo GraphQL](https://www.apollographql.com/) has an [integration package](https://atmospherejs.com/meteor/apollo) with Meteor
- REST APIs for simpler use cases

Do note, that you can mix all of these based on your needs.

### Low observer reuse

Observers are among the key components of Meteor. They take care of observing documents on MongoDB and they notify changes. Creating them is an expensive operation, so you want to make sure that Meteor reuses them as much as possible.

> [Learn more about observers](https://docs.montiapm.com/academy/know-your-observers)

The key for observer reuse is to make sure that the queries requested are identical. This means that user given values should be standardized and so should any dynamic input like time. Publications for users should check if user is signed in first before returning publication and if user is not signed in, then it should instead call `this.ready();`.

```js
Meteor.publish('userPosts', function() {
  // Good: Check auth first to enable observer reuse
  if (!this.userId) {
    return this.ready();
  }

  return Posts.find({ userId: this.userId });
});
```

> [Learn more on improving observer reuse](https://docs.montiapm.com/academy/improving-cpu-network-usage)

### Redis Oplog

[Redis Oplog](https://atmospherejs.com/cultofcoders/redis-oplog) is a popular solution to Meteor's Oplog tailing (which ensures the reactivity, but has some severe limitations that especially impact performance). Redis Oplog as name suggests uses [Redis](https://redis.io/) to track changes to data that you only need and cache them. This reduces load on the server and database, allows you to track only the data that you want and only publish the changes you need.

## Methods

While methods are listed as one of the possible replacements for publications, they themselves can be made more performant. After all it really depends on what you put inside them and APM will provide you with the necessary insight on which methods are the problem.

### Heavy actions

In general heavy tasks that take a lot of resources or take long and block the server for that time should be taken out and instead be run in its own server that focuses just on running those heavy tasks. This can be another Meteor server or even better something specifically optimized for that given task.

### Reoccurring jobs

Reoccurring jobs are another prime candidate to be taken out into its own application. What this means is that you will have an independent server that is going to be tasked with running the reoccurring jobs and the main application will only add to the list and be recipient of the results, most likely via database results.

### Rate limiting

Rate limit your methods to reduce effectiveness of DDoS attacks and spare your server. This is also a good practice to ensure that you don't accidentally DDoS yourself. For example a user who clicks multiple times on a button that triggers an expensive function.

In this example you should also in general ensure that any button that triggers a server event should be disabled until there is a response from the server that the event has finished.

You can and should rate limit both methods and subscriptions.

> [Learn more about rate limiting](/api/DDPRateLimiter)

## MongoDB

The following section offers some guidance on optimizing performance of your Meteor application when it comes to the database. You can find these and more information in other places that deal with MongoDB performance optimization, like on the [official MongoDB website](https://www.mongodb.com/basics/best-practices). These are all applicable, and you should spend some time researching into them as well. The guide here offers some initial and most common patterns.

### IP whitelisting

If your MongoDB hosting provider allows it, you should make sure that you whitelist the IPs of your application servers. If you don't then your database servers are likely to come under attack from hackers trying to brute force their way in. Besides the security risk this also impacts performance as authentication is not a cheap operation and it will impact performance.

See the [Galaxy container environment guide](https://help.galaxycloud.app/en/article/container-environment-lfd6kh/) on IP whitelisting to get IPs for your Galaxy servers.

### Indexes

While single indexes on one field are helpful on simple query calls, you will most likely have more advanced queries with multiple variables. To cover those you will need to create compound indexes. For example:

```js
await Statistics.createIndexAsync(
  {
    pageId: 1,
    language: 1,
    date: 1
  },
  { unique: true }
);
```

When creating indexes you should sort the variables in ESR (Equality, Sort, Range) style:

1. First you put variables that will be equal to something specific
2. Second you put variables that sort things
3. Third variables that provide range for that query

Further you should order these variables in a way that the fields that filter the most should be first.

Make sure that all the indexes are used and remove unused indexes as leaving unused indexes will have negative impact on performance as the database will have to still keep track on all the indexed variables.

### Find strategies

To optimize finds ensure that all queries are indexed. Meaning that any `.find()` variables should be indexed as described above.

All your finds should have a limit on the return so that the database stops going through the data once it has reached the limit, and you only return the limited number of results instead of the whole database.

Beware of queries with `n + 1` issue. For example in a database that has cars and car owners. You don't want to get cars, and then call the database for each car owner, instead you want to use only two queries. One where you get all the cars and second where you get all the owners and then match the data on the front-end.

```js
// Bad: N+1 queries
const cars = await Cars.find().fetchAsync();
for (const car of cars) {
  const owner = await Owners.findOneAsync({ _id: car.ownerId }); // N queries!
}

// Good: 2 queries
const cars = await Cars.find().fetchAsync();
const ownerIds = cars.map(car => car.ownerId);
const owners = await Owners.find({ _id: { $in: ownerIds } }).fetchAsync();
```

Additional tips:

- Check all queries that run longer than 100ms as there might be issues
- Do not use RegEx for your queries as these queries have to go through all the data to do that match
- If you still have issues make sure that you read data from secondaries

### Beware of collection hooks

While collection hooks can help in many cases beware of them and make sure that you understand how they work as they might create additional queries that you might not know about. Make sure to review packages that use them so that they won't create additional queries.

### Caching

Once your user base increases you want to invest into query caching like using Redis, Redis Oplog and other. For more complex queries or when you are retrieving data from multiple collections, then you want to use [aggregation](https://www.mongodb.com/docs/manual/aggregation/) and save their results.

## Scaling

### Vertical and horizontal scaling

There are mainly two different ways of scaling: the vertical and horizontal one.

- **Vertical scaling** boils down to adding more resources (CPU/RAM/disk) to your containers
- **Horizontal scaling** refers to adding more machines or containers to your pool of resources

Horizontal scaling for Meteor projects typically includes running multiple instances of your app on a single container with multiple cores, or running multiple instances on multiple containers.

### Container autoscaling

It is important to be ready for sudden spikes of traffic. While all the other measures mentioned here will help, at a certain point it becomes impossible to support more users on one container and additional containers need to be added to support these users.

Today most hosting solutions offer scaling triggers that you can set to automatically scale up (and down) the number of containers for your app based on things like number of connections, CPU and RAM usage. Galaxy has these as well. Learn more about [setting triggers for scaling on Galaxy](https://help.galaxycloud.app/en/article/scaling-meteor-apps-1wxc9dq/).

Setting this is vital, so that your application can keep on running when you have extra people come and then saves you money by scaling down when the containers are not in use.

When initially setting these pay a close attention to the performance of your app. You need to learn when is the right time to scale your app so it has enough time to spin up new containers before the existing ones get overwhelmed by traffic.

There are other points to pay attention to as well. For example if your app is used by a corporation you might want to setup that on weekdays the minimum number of containers is going to increase just before the start of working hours and then decrease the minimum to 1 for after hours and on weekends.

Usually when you are working on performance issues you will have higher numbers of containers as you optimize your app. It is therefore vital to revisit your scaling settings after each round of improvements to ensure that scaling triggers are properly optimized.

## Packages

During development, it is very tempting to add packages to solve issues or support some features. This should be done carefully and each package should be vetted carefully if it is a good fit for the application.

Besides security and maintenance issues you also want to know which dependencies a given package introduces and as a whole what will be the impact on performance.

## Further reading

- [Monti APM Documentation](https://docs.montiapm.com/)
- [Monti APM Academy](https://docs.montiapm.com/academy/know-your-observers) - Learn about observers, CPU optimization, and more
- [MongoDB Best Practices](https://www.mongodb.com/basics/best-practices)
- [Redis Oplog](https://atmospherejs.com/cultofcoders/redis-oplog)
- [WebSocket Compression](/performance/websocket-compression)
