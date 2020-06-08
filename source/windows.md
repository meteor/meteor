---
title: Windows
description: Troubleshooting Meteor on Windows
---

<h2 id="cant-start-mongo-server">Can't start Mongo server</h2>

If your embed MongoDB is not starting when you run `meteor` and you see messages like these:

```shell script
C:\Users\user\app> meteor
=> Started proxy.
Unexpected mongo exit code 3221225781. Restarting.
Unexpected mongo exit code 3221225781. Restarting.
Unexpected mongo exit code 3221225781. Restarting.
Can't start Mongo server.
```

You [probably](https://github.com/meteor/meteor/issues/10036#issuecomment-416485306) need to install `Visual C++ Redistributable for Visual Studio 2015`. 

Download it [here](https://www.microsoft.com/en-us/download/confirmation.aspx?id=48145) and install.

After installing `vc_redist.x64` you should be able to run Meteor and MongoDB server without problems.
