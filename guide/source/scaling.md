---
title: Scaling
description: How to optimize your Meteor application for higher performance when you start growing.
---

This guide focuses on providing you tips and common practices on how to scale your Meteor app. 
It is important to note that at the end of the day Meteor is a Node.js app tied closely to MongoDB, 
so a lot of the problems you are going to encounter are common to other Node.js and MongoDB apps. 
Also do note that every app is different so there are unique challenges to each when scaling, so 
practices describe in this guide should be used as a guiding posts rather than absolutes.

This guide has been heavily inspired by [Marcin Szuster's Vazco article](https://www.vazco.eu/blog/how-to-optimize-and-scale-meteor-projects)
on this issue and talk by Paulo Mogollón's talk at Impact 2022 titled "First steps on scaling Meteor realtime data".

TODO video from Impact 2022 https://impact.meteor.com/meetings/virtual/uo2Er8YPqx2vuRcne

<h2 id="performance-monitoring">Performance monitoring</h2>

Before any optimization can take place we need to know what is our problem. This is where APM (Application Performance Monitor) comes in.
If you are hosting on Galaxy then this is automatically included in the [Professional plan](https://www.meteor.com/cloud#pricing-section) 
and you can learn more about in its [own dedicated guide article](https://cloud-guide.meteor.com/apm-getting-started.html).  
For those hosting outside of Galaxy the most popular solution is to go with [Monti APM](https://montiapm.com/) which shares 
all the main functionality with Galaxy APM. You can also choose other APM for Node.js, but they will not show you Meteor 
specific data that Galaxy APM and Monti APM specialize in. For this guide we will focus on showing how to work with Galaxy APM, 
which is the same as with Monti APM, for simplicity.

Once you setup either of those APMs you will need to add a package to your Meteor app to start sending them data.

#### Galaxy APM [package](https://atmospherejs.com/mdg/meteor-apm-agent)
```sh
meteor add mdg:meteor-apm-agent
```

#### Monti APM [package](https://atmospherejs.com/montiapm/agent)
```sh
meteor add montiapm:agent
```

<h3 id="find-issues-apm">Finding issues in APM</h3>
APM will start with providing you with an overview of how your app is performing. You can then dive deep into details of 
publications, methods, errors happening (both on client and server) and more. You will spend a lot of time in the detailed 
tabs looking for methods and publications to improve and analyzing the impact of your actions. The process, for example for 
optimizing methods, will look like this:

1. Go to the detailed view under the Methods tab.
2. Sort the Methods Breakdown by Response Time.
3. Click on a method name in the Methods Breakdown. Assess the impact if you improve the selected method.
4. Look at the response time graph and find a trace.
5. Improve your method if you feel it is the right moment to do so.

Not every long-performing method has to be improved. Take a look at the following example:
* methodX - mean response time 1 515 ms, throughput 100,05/min
* methodY - mean response time 34 000 ms, throughput 0,03/min

At first glance, the 34 seconds response time can catch your attention, and it may seem that the methodY 
is more relevant to improvement. But don’t ignore the fact that this method is being used only once in 
a few hours by the system administrators or scheduled cron action.

And now, let’s take a look at the methodX. Its response time is evidently lower BUT compared to the frequency 
of use, it is still high, and without any doubt should be optimized first.

It’s also absolutely vital to remember that you shouldn't optimize everything as it goes. 
The key is to think strategically and match the most critical issues with your product priorities.

<h2 id="publications">Publications</h2>
<h3 id="low-observer-reuse">Low observer reuse</h3>

https://www.vazco.eu/blog/how-to-optimize-and-scale-meteor-projects

<h3 id="redis-oplog">Redis Oplog</h3>
14:26
* reduces load on server
* channels
* only publish the changes you need

<h2 id="methods">Methods</h2>

<h3 id="heavy-actions">Heavy actions</h3>
6:49

<h3 id="reoccurring-jobs">Reoccurring jobs</h3>

<h3 id="rate-limiting">Rate limiting</h3>

<h2 id="mongodb">MongoDB</h2>
* always limit access to your cluster (IP whitelisting)

<h3 id="mongodb-indexes">Indexes</h3>
10:00
* compound indexes
* ESR (equity, sort, range)
* only the ones needed
* n + 1
* read from secondaries
* do not use regex
* too many indexes actually slow things down

<h3 id="find-strategies">Find strategies</h3>
17:46
* all queries should have an index
* Fields that filter the most should be first

<h3 id="beware-of-collection-hooks">Beware of collection hooks</h3>

<h3 id="mongodb-caching">Caching</h3>
* query caching
* use aggregation & save them

<h3 id="methods-publications">Methods over publications</h3>
also consider GraphQL or REST
8:00

<h2 id="scaling">Scaling</h2>

<h3 id="vertical-horizontal">Vertical and horizontal scaling</h3>
There are mainly two different ways of scaling: the vertical and horizontal one.

* **Vertical scaling** boils down to adding more resources (CPU/RAM/disk) to your server, while horizontal scaling refers to adding more machines or containers to your pool of resources.
* **Horizontal scaling** for Meteor projects typically includes running multiple instances of your app on a single server with multiple cores, or running multiple instances on multiple servers.

<h3 id="autoscaling">Autoscaling</h3>

<h2 id="packages">Packages</h2>

During development it is very tempting to add packages to solve issue or support some features. 
This should be done carefully and each package should be wetted carefully if it is a good fit for the application. 
Besides security and maintenance issues you also want to know which dependencies given package introduces and 
as a whole what will be the impact on performance.
