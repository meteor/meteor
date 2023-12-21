# Meteor API

Meteor global object has many functions and properties for handling utilities, network and much more.

<ApiBox name="Meteor.startup"/>


<ApiBox name="Meteor.isClient" />

<ApiBox name="Meteor.isServer" />

::: danger
`Meteor.isServer` can be used to limit where code runs, but it does not prevent code from
being sent to the client. Any sensitive code that you don’t want served to the client,
such as code containing passwords or authentication mechanisms,
should be kept in the `server` directory.
:::

<ApiBox name="Meteor.isCordova" />
<ApiBox name="Meteor.isDevelopment" />
<ApiBox name="Meteor.isProduction" />
<ApiBox name="Meteor.isModern" />
<ApiBox name="Meteor.isTest" />
<ApiBox name="Meteor.isAppTest" />
<ApiBox name="Meteor.isPackageTest" />
