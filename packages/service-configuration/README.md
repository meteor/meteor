# service-configuration

Configure login services. Example:

```
// first, remove configuration entry in case service is already configured
ServiceConfiguration.configurations.remove({
  service: "weibo"
});
ServiceConfiguration.configurations.insert({
  service: "weibo",
  clientId: "1292962797",
  secret: "75a730b58f5691de5522789070c319bc"
});
```

Read more in the [Meteor
docs](http://docs.meteor.com/#meteor_loginwithexternalservice) and the
Meteor Accounts [project page](https://www.meteor.com/accounts).