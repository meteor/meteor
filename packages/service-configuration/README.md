# service-configuration
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/service-configuration) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/service-configuration)
***

Configure login services on the server. Example:

```
await ServiceConfiguration.configurations.upsertAsync(
  { service: "weibo" },
  { $set: { clientId: "1292962797", secret: "75a730b58f5691de5522789070c319bc" } }
);
```

You can also configure services in `Meteor.settings.packages["service-configuration"]`.

The `accounts-ui` configuration dialog saves the configuration from the client
with the `configureLoginService` method. By default, the server only accepts
that method from clients in development, so that visitors of a deployed app
cannot configure a service before you do. See the
`allowClientServiceConfiguration` option of `Accounts.config`.

Read more in the [Meteor
docs](http://docs.meteor.com/#meteor_loginwithexternalservice) and the
Meteor Accounts [project page](https://docs.meteor.com/api/accounts).
