<h2 id="deploying">Deploying</h2>

Meteor is a full application server.  We include everything you need
to deploy your application on the internet: you just provide the JavaScript,
HTML, and CSS.

<h3 class="nosection">Running on Meteor's infrastructure</h3>

The easiest way to deploy your application is to use `meteor
deploy`.  We provide it because it's what, personally, we've always
wanted: an easy way to take an app idea, flesh it out over a weekend,
and put it out there for the world to use, with nothing getting in the
way of creativity.

    $ meteor deploy myapp.meteor.com

Your application is now available at myapp.meteor.com.  If
this is the first time deploying to this hostname, Meteor creates a
fresh empty database for your application.  If you want to deploy an
update, Meteor will preserve the existing data and just refresh the
code.

You can also deploy to your own domain.  Just set up the hostname you
want to use as a CNAME to `origin.meteor.com`,
then deploy to that name.

    $ meteor deploy www.myapp.com

We provide this as a free service so you can try Meteor.  It is also
helpful for quickly putting up internal betas, demos, and so on.

<h3 class="nosection">Running on your own infrastructure</h3>

You can also run your application on your own infrastructure, or any
other hosting provider like Heroku.

To get started, run

    $ meteor bundle myapp.tgz

This command will generate a fully-contained Node.js application in the form of
a tarball.  To run this application, you need to provide Node.js 0.8 and a
MongoDB server.  (The current release of Meteor has been tested with Node
0.8.24.) You can then run the application by invoking node, specifying the HTTP
port for the application to listen on, and the MongoDB endpoint.  If you don't
already have a MongoDB server, we can recommend our friends at
[MongoHQ](http://mongohq.com).

    $ PORT=3000 MONGO_URL=mongodb://localhost:27017/myapp node bundle/main.js

Other packages may require other environment variables (for example, the `email`
package requires a `MAIL_URL` environment variable).

{{#warning}}
For now, bundles will only run on the platform that the bundle was
created on.  To run on a different platform, you'll need to rebuild
the native packages included in the bundle.  To do that, make sure you
have `npm` available, and run the following:

    $ cd bundle/server/node_modules
    $ rm -r fibers
    $ npm install fibers@1.0.1
{{/warning}}
