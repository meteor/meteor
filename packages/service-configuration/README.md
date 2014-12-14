# service-configuration

Configure login services. Example:

```
ServiceConfiguration.configurations.update(
  { service: "weibo" },
  { $set: { clientId: "1292962797", secret: "75a730b58f5691de5522789070c319bc" } },
  { upsert: true }
);
```

Read more in the [Meteor
docs](http://docs.meteor.com/#meteor_loginwithexternalservice) and the
Meteor Accounts [project page](https://www.meteor.com/accounts).