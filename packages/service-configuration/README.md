# service-configuration
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/service-configuration) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/service-configuration)
***

Configure login services. Example:

```
ServiceConfiguration.configurations.upsert(
  { service: "weibo" },
  { $set: { clientId: "1292962797", secret: "75a730b58f5691de5522789070c319bc" } }
);
```

Read more in the [Meteor
docs](http://docs.meteor.com/#meteor_loginwithexternalservice) and the
Meteor Accounts [project page](https://www.meteor.com/accounts).
