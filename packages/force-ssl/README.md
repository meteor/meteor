# force-ssl
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/force-ssl) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/force-ssl)
***

This package, part of [Webapp](https://github.com/meteor/meteor/tree/master/packages/webapp), causes
Meteor to redirect insecure connections (HTTP) to a secure URL
(HTTPS). Use this package to ensure that communication to the server
is always encrypted to protect users from active spoofing attacks.

To simplify development, unencrypted connections from `localhost` are
always accepted over HTTP.

Application bundles (`meteor bundle`) do not include an HTTPS server or
certificate. A proxy server that terminates SSL in front of a Meteor
bundle must set the standard `x-forwarded-proto` header for the
`force-ssl` package to work.

If you're deploying your app to [Galaxy](https://www.meteor.com/hosting), we
recommend using Galaxy's built-in "Force HTTPS" setting (on the specific domain
in the "Domains & Encryption" section of your app's Settings tab) instead of
this package.  This package read a header to guess whether or not a connection
arrived over HTTPS, and uses a heuristic to guess if it's running in development
mode; the Galaxy feature can directly observe which port the connection arrived
on and by its nature is not involved in development mode.  We recommend this
package only for deployment platforms that do not have their own "Force HTTPS"
feature.
