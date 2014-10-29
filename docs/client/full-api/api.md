{{#template name="api"}}

<h1 id="api">The Meteor API</h1>

Your JavaScript code can run in two environments: the *client* (browser), and
the *server* (a [Node.js](http://nodejs.org/) container on a server).  For each
function in this API reference, we'll indicate if the function is available just
on the client, just on the server, or *Anywhere*.

{{> apiCore}}
{{> apiPubsub}}
{{> apiMethods}}
{{> apiCheck}}
{{> apiConnections}}
{{> apiCollections}}
{{> apiSession}}
{{> apiAccounts}}
{{> apiPasswords}}
{{> apiTemplates}}
{{> apiBlaze}}
{{> apiTimers}}
{{> apiTracker}}
{{> apiReactiveVar}}
{{> apiEjson}}
{{> apiHttp}}
{{> apiEmail}}
{{> apiAssets}}
{{> apiPackagejs}}
{{> apiMobileConfig}}

{{/template}}
