# autoupdate-polling

`autoupdate-polling` is based on the popular [`autoupdate`](https://github.com/meteor/meteor/tree/master/packages/autoupdate). 
The goal is to provide a lightweight alternative that replaces the use of `ddp` 
by a polling mechanism that checks the server for a new version every 3 seconds<sup>1</sup>.
When it sees that a new version is available, it uses the [`reload`](https://atmospherejs.com/meteor/reload) 
package to gracefully save the app's state and reload it in place.

To make it work, the server exposes a public endpoint that expects 
the client's archetype and returns the most recent build of the app's client.

**production client bundle size for a --minimal meteor app**

|   |   |   |
|---|---|---|
| `vanilla --minimal`  | 17.8 KB |
| `with autoupdate`  | 48.3 KB | + 30.5 KB
| `with autoupdate-polling`  | 21.5 KB | + 3.7 KB

<sup>1</sup>
<sub>To change how frequently the client should poll the server for a new 
version set a public [setting](https://docs.meteor.com/api/core.html#Meteor-settings) `pollingInterval` in milliseconds. 
The polling will not work in production without this setting explicitly 
informed.</sub>
```json
{
  "public": {
    "packages": {
      "autoupdate-polling": {
        "options": {
          "pollingInterval": 3000
        }
      }
    }
  }
}
```
