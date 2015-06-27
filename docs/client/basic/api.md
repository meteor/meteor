{{#template name="basicApi"}}

<h1 id="api">The Meteor API</h1>

Your JavaScript code can run in two environments: the *client* (browser), and
the *server* (a [Node.js](http://nodejs.org/) container on a server).  For each
function in this API reference, we'll indicate if the function is available just
on the client, just on the server, or *Anywhere*.

{{> basicTemplates}}
{{> basicSession}}
{{> basicTracker}}
{{> basicCollections}}
{{> basicAccounts}}
{{> basicMethods}}
{{> basicPubsub}}
{{> basicEnvironment}}

{{/template}}