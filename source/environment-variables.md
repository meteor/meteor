---
title: Environment Variables
description: List of environment variables that you can use with your Meteor application.
---

Here's a list of the environment variables you can provide to your application.

## BIND_IP
(_production_)

Bind the application server to a specific network interface by IP address, for example: `BIND_IP=192.168.0.2`.

See also: [`PORT`](#PORT).

> In development, this can be accomplished with `meteor run --port a.b.c.d:port`.

## DISABLE_WEBSOCKETS
(_development, production_)

In the event that your own deployment platform does not support WebSockets, or you are confident that you will not benefit from them, setting this variable with `DISABLE_WEBSOCKETS=1` will explicitly disable WebSockets and forcibly resort to the fallback polling-mechanism, instead of trying to detect this automatically.

## HTTP_FORWARDED_COUNT
(_production_)

Set this to however many number of proxies you have running before your Meteor application. For example, if have an NGINX server acting as a proxy before your Meteor application, you would set `HTTP_FORWARDED_COUNT=1`. If you have a load balancer in front of that NGINX server, the count is 2.

## MAIL_URL
(_development, production_)

If you're using an external mail service like [Postmark](https://www.postmarkapp.com), [Mandrill](https://www.mandrillapp.com), [MailGun](https://www.mailgun.com) or [SendGrid](https://www.sendgrid.net), you can provide a SMTP URL for your Meteor app to use to send e-mail. For example: `MAIL_URL="smtps://user:pass@yourservice.com:465"`.  If the e-mail server is **not** using TLS/SSL or uses connection upgrade (e.g. on port `587`) then `smtp://` can be used in place of `smtps://` (the `s` is for "secure"). For more information see the [Nodemailer docs](https://nodemailer.com/smtp/)

## METEOR_SETTINGS
(_production_)

When running your bundled application in production mode, pass a string of JSON containing your settings with `METEOR_SETTINGS='{ "server_only_setting": "foo", "public": { "client_and_server_setting": "bar" } }'`.

> In development, this is accomplished with `meteor --settings [file.json]` in order to provide full-reactivity when changing settings.  Those settings are simply passed as a string here. Please see the [Meteor.settings](http://docs.meteor.com/api/core.html#Meteor-settings) documentation for further information. 

## MONGO_OPLOG_URL
(_development, production_)

MongoDB server oplog URL. If you're using a replica set (which you should), construct this url like so: `MONGO_URL="mongodb://user:password@myserver.com:10139/local?replicaSet=(your replica set)&authSource=(your auth source)"`

## MONGO_URL
(_development, production_)

MongoDB server URL. Give a fully qualified URL (or comma-separated list of URLs) like `MONGO_URL="mongodb://user:password@myserver.com:10139"`. For more information see the [MongoDB docs](https://docs.mongodb.com/manual/reference/connection-string/).

## METEOR_PACKAGE_DIRS
(_development, production_)

Colon-delimited list of local package directories to look in, outside your normal application structure, for example: `METEOR_PACKAGE_DIRS="/usr/local/my_packages/"`. Note that this used to be `PACKAGE_DIRS` but was changed in Meteor 1.4.2.

## PORT
(_production_)

Which port the app should listen on, for example: `PORT=3030`

See also: [`BIND_IP`](#BIND_IP).

> In development, this can be accomplished with `meteor run --port <port>`.

## ROOT_URL
(_development, production_)

Used to generate URLs to your application by, among others, the accounts package. Provide a full URL to your application like this: `ROOT_URL="https://www.myapp.com"`. 
