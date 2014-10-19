# force-ssl

This package, part of [Webapp](https://www.meteor.com/webapp), causes
Meteor to redirect insecure connections (HTTP) to a secure URL
(HTTPS). Use this package to ensure that communication to the server
is always encrypted to protect users from active spoofing attacks.

To simplify development, unencrypted connections from `localhost` are
always accepted over HTTP.

Application bundles (`meteor bundle`) do not include an HTTPS server or
certificate. A proxy server that terminates SSL in front of a Meteor
bundle must set the standard `x-forwarded-proto` header for the
`force-ssl` package to work.

Applications deployed to `meteor.com` subdomains with
`meteor deploy` are automatically served via HTTPS using Meteor's
certificate.
