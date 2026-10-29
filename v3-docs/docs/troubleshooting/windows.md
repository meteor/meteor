
# Windows

Trouble installing Meteor on Windows

## Can't start Mongo server {#cant-start-mongo-server}

First check the [operating system requirements](/about/install#prereqs-os). Meteor 3.6's bundled MongoDB 8.0 requires Windows 11 or Windows Server 2022 (x64); installing a redistributable does not add support for older Windows versions.

If your embed MongoDB is not starting when you run `meteor` and you see messages like these:

```shell script
C:\Users\user\app> meteor
=> Started proxy.
Unexpected mongo exit code 3221225781. Restarting.
Unexpected mongo exit code 3221225781. Restarting.
Unexpected mongo exit code 3221225781. Restarting.
Can't start Mongo server.
```

You [probably](https://github.com/meteor/meteor/issues/10036#issuecomment-416485306) need to install `Visual C++ Redistributable for Visual Studio`, depending on your Windows and Meteor embbeded version of MongoDB the version of Visual Studio could be different. You can check the version that we are using in our Windows test environment [here](https://github.com/meteor/meteor/blob/devel/appveyor.yml#L10)

Starting from MongoDB 4.4.4 we started to use Visual Studio 2019.

Until MongoDB 4.2 [this](https://www.microsoft.com/en-us/download/confirmation.aspx?id=48145) was the usually the right version to be installed.

On a supported Windows version, installing the required `vc_redist.x64` can resolve missing-runtime errors. If startup still fails, check the MongoDB error output; existing databases may also need the [MongoDB 7 to 8 preparation steps](/about/install#updating-local-database).
