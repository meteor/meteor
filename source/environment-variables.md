---
title: Environment Variables
description: List of environment variables that you can use with your Meteor application.
---

Here's a list of the environment variables you can provide to your application. All of these work both in development and production mode.

<h2 id="BIND_IP">BIND_IP</h2>

Bind the application server to a specific network interface by IP address, for example: `BIND_IP=192.168.0.2`.

<h2 id="DISABLE_WEBSOCKETS">DISABLE_WEBSOCKETS</h2>

In the event that your own deployment platform does not support WebSockets, or you are confident that you will not benefit from them, setting this variable with `DISABLE_WEBSOCKET=1` will explicitly disable WebSockets and forcibly resort to the fallback polling-mechanism, instead of trying to detect this automatically.

<h2 id="HTTP_FORWARDED_COUNT">HTTP_FORWARDED_COUNT</h2>

Set this to however many number of proxies you have running before your Meteor application. For example, if have an NGINX server acting as a proxy before your Meteor application, you would set `HTTP_FORWARDED_COUNT=1`. If you have a load balancer in front of that NGINX server, the count is 2.

<h2 id="MAIL_URL">MAIL_URL</h2>

If you're using an external mail service like [Postmark](https://www.postmarkapp.com), [Mandrill](https://www.mandrillapp.com), [MailGun](https://www.mailgun.com) or [SendGrid](https://www.sendgrid.net), you can provide a SMTP URL for your Meteor app to use to send e-mail. For example: `MAIL_URL="smtp://user@pass:yourservice.com:587"`.

<h2 id="METEOR_SETTINGS">METEOR_SETTINGS</h2>

When running your bundled application in production mode, pass a string of JSON containing your settings with `METEOR_SETTINGS='{ "server_only_setting": "foo", "public": { "client_and_server_setting": "bar" } }'`. While you use `meteor --settings [file.json]` to pass settings while developing, you can simply pass those same settings as a string here. [Please see the API description for Meteor.settings for further information about settings](http://docs.meteor.com/api/core.html#Meteor-settings). 

<h2 id="MONGO_OPLOG_URL">MONGO_OPLOG_URL</h2>

MongoDB server oplog URL. If you're using a replica set (which you should), construct this url like so: `MONGO_URL="mongodb://user@password:myserver.com:10139/local?replicaSet=(your replica set)&authSource=(your auth source)"`

<h2 id="MONGO_URL">MONGO_URL</h2>

MongoDB server URL. Give a fully qualified URL (or comma-separated list of URLs) like `MONGO_URL="mongodb://user@password:myserver.com:10139"`. For more information see the [MongoDB docs](https://docs.mongodb.com/manual/reference/connection-string/).

<h2 id="PACKAGE_DIRS">PACKAGE_DIRS</h2>

Colon-delimited list of local package directories to look in, outside your normal application structure, for example: `PACKAGE_DIRS="/usr/local/my_packages/"`

<h2 id="PORT">PORT</h2>

Which port the app should listen on, for example: `PORT=3030`

<h2 id="ROOT_URL">ROOT_URL</h2>

Used to generate URLs to your application by, among others, the accounts package. Provide a full URL to your application like this: `ROOT_URL="https://www.myapp.com"`. 
