
# Windows

Trouble installing Meteor on Windows

## Can't start Mongo server {#cant-start-mongo-server}

If your embed MongoDB is not starting when you run `meteor` and you see messages like these:

```shell script
C:\Users\user\app> meteor
=> Started proxy.
Unexpected mongo exit code 3221225781. Restarting.
Unexpected mongo exit code 3221225781. Restarting.
Unexpected mongo exit code 3221225781. Restarting.
Can't start Mongo server.
```

You [probably](https://github.com/meteor/meteor/issues/10036#issuecomment-416485306) need to install the `Visual C++ Redistributable`. The MongoDB version bundled with Meteor (currently 7.x — see `MONGO_VERSION_64BIT` in [`scripts/build-dev-bundle-common.sh`](https://github.com/meteor/meteor/blob/devel/scripts/build-dev-bundle-common.sh)) requires the latest Visual C++ 2015-2022 Redistributable. Download `vc_redist.x64.exe` from [Microsoft's latest supported Visual C++ Redistributable page](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) (direct download: [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)).

After installing `vc_redist.x64` you should be able to run Meteor and MongoDB server without problems.
