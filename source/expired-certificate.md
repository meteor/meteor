---
title: Expired Certificates
description: Troubleshooting Expired Certificates Issues
---

<h2 id="certificates-issue">Can't start Meteor due to certificate issues</h2>

Galaxy and all Meteor servers uses Let's Encrypt, which announced a change in May in this [post](https://letsencrypt.org/docs/dst-root-ca-x3-expiration-september-2021) about DST Root CA X3 expiring on September 30, 2021.

Older versions of Meteor, more specifically anything older than Meteor v1.9 shipped with a Node.JS version below v10, which used OpenSSL < 1.0.2.


![](/images/openssl-suport-table.png)


If you are getting errors like Connection error (certificate has expired) when running Meteor commands it means that you are running a version of Meteor older than v1.9.

A workaround, for now, is to run all the meteor commands with the following environment variable ***NODE_TLS_REJECT_UNAUTHORIZED***, for example in the deploy command:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 meteor deploy
```

Also note that if you are running old distributions, like Ubuntu 16 and before, locally, or in any of your CI pipelines you may also face this issue. In this case, we do recommend updating your distribution, or your local repository of root certificates (the how-to of this varies based on your distribution).

If your server is accessing external let’s encrypt resources with an old Meteor version, you will also need to add NODE_TLS_REJECT_UNAUTHORIZED to your container env vars. If you are using Galaxy, it's simple as using your settings file:

```json
{
  "galaxy.meteor.com": {
    "env": {
      "NODE_TLS_REJECT_UNAUTHORIZED": "0"
    }
  }
}
```

***Please note:*** We don't recommend continued use of this workaround, as any SSL certificate is going to be authorized and you are exposing your application to serious security issues. The best option is to update Meteor to latest version, or a supported one.

You can check our list of supported Meteor versions [here](https://github.com/meteor/meteor/blob/devel/SECURITY.md#supported-versions). If your applications is not in one of them, you should migrate asap.

<h2 id="client-compatibility">Client Compatibility</h2>

As stated before, Galaxy issues Let's Encrypt certificates automatically for all clients. This is source of confusion, as if you are depending on older clients being able to access your website, this won't work.

If Let's encrypt certificates are not good for your clients you would need to acquire other certificate from a different provider and upload your custom certificate into Galaxy.

You can also generate a Let's Encrypt certificate manually and upload to Galaxy, but specifying an alternative preferred chain on certbot:

```
sudo certbot certonly --manual --preferred-chain "ISRG Root X1" --preferred-challenges dns
```

More info can be obtained [here](https://letsencrypt.org/certificates).
