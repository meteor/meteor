# Topology Closed Error

One possible scenario we've seen is that after migrating to Meteor 3, some apps become partially unresponsive and throw `MongoTopologyClosedError: Topology is closed` errors on startup.

In this case, you might consider increasing the server selection timeout for your MongoDB instance, like this:

```json
{
  "packages": {
    "mongo": {
      "options": {
        "serverSelectionTimeoutMS": 120000
      }
    }
  }
}
```