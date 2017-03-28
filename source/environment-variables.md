---
title: Environment Variables
description: List of environment variables that you can use with your Meteor application.
---

Here's a list of the environment variables you can provide to your application.

## BIND_IP

Bind the application server to a specific network interface by IP address, for example: `BIND_IP=192.168.0.2`.

## DISABLE_WEBSOCKETS

In the event that your own deployment platform does not support WebSockets, or you are confident that you will not benefit from them, setting this variable with `DISABLE_WEBSOCKETS=1` will explicitly disable WebSockets and forcibly resort to the fallback polling-mechanism, instead of trying to detect this automatically.

## HTTP_FORWARDED_COUNT

Set this to however many number of proxies you have running before your Meteor application. For example, if have an NGINX server acting as a proxy before your Meteor application, you would set `HTTP_FORWARDED_COUNT=1`. If you have a load balancer in front of that NGINX server, the count is 2.

## MAIL_URL

If you're using an external mail service like [Postmark](https://www.postmarkapp.com), [Mandrill](https://www.mandrillapp.com), [MailGun](https://www.mailgun.com) or [SendGrid](https://www.sendgrid.net), you can provide a SMTP URL for your Meteor app to use to send e-mail. For example: `MAIL_URL="smtp://user@pass:yourservice.com:587"`.

## METEOR_SETTINGS

When running your bundled application in production mode, pass a string of JSON containing your settings with `METEOR_SETTINGS='{ "server_only_setting": "foo", "public": { "client_and_server_setting": "bar" } }'`. While you use `meteor --settings [file.json]` to pass settings while developing, you can simply pass those same settings as a string here. [Please see the API description for Meteor.settings for further information about settings](http://docs.meteor.com/api/core.html#Meteor-settings). 

## MONGO_OPLOG_URL

MongoDB server oplog URL. If you're using a replica set (which you should), construct this url like so: `MONGO_URL="mongodb://user@password:myserver.com:10139/local?replicaSet=(your replica set)&authSource=(your auth source)"`

## MONGO_URL

MongoDB server URL. Give a fully qualified URL (or comma-separated list of URLs) like `MONGO_URL="mongodb://user@password:myserver.com:10139"`. For more information see the [MongoDB docs](https://docs.mongodb.com/manual/reference/connection-string/).

## METEOR_PACKAGE_DIRS

Colon-delimited list of local package directories to look in, outside your normal application structure, for example: `METEOR_PACKAGE_DIRS="/usr/local/my_packages/"`. Note that this used to be `PACKAGE_DIRS` but was changed in Meteor 1.4.2.

## PORT

Which port the app should listen on, for example: `PORT=3030`

## ROOT_URL

Used to generate URLs to your application by, among others, the accounts package. Provide a full URL to your application like this: `ROOT_URL="https://www.myapp.com"`. 
