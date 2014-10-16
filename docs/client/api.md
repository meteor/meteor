{{#template name="api"}}

<h1 id="api">The Meteor API</h1>

Your JavaScript code can run in two environments: the *client* (browser), and
the *server* (a [Node.js](http://nodejs.org/) container on a server).  For each
function in this API reference, we'll indicate if the function is available just
on the client, just on the server, or *Anywhere*.

{{> api_core}}
{{> api_pubsub}}
{{> api_methods}}
{{> api_check}}
{{> api_connections}}
{{> api_collections}}
{{> api_session}}
{{> api_accounts}}
{{> api_passwords}}
{{> api_templates}}
{{> api_blaze}}
{{> api_timers}}
{{> api_tracker}}
{{> api_reactive_var}}
{{> api_ejson}}
{{> api_http}}
{{> api_email}}
{{> api_assets}}
{{> api_packagejs}}
{{> api_mobile_config}}

{{/template}}
