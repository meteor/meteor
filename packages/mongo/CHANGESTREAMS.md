# MongoDB Change Streams Configuration

Meteor now supports MongoDB Change Streams as an alternative to oplog tailing for real-time updates.

## Configuration

Add this to your `settings.json`:

```json
{
  "packages": {
    "mongo": {
      "useChangeStreams": true,
      "options": {
        // MongoDB connection options
      }
    }
  }
}
```

## Settings Options

- `useChangeStreams` (boolean, default: true): Enable/disable Change Streams
- When `true`: Meteor will use Change Streams if available, otherwise fall back to oplog
- When `false`: Meteor will skip Change Streams and use oplog or polling

## Requirements

Change Streams require:
- MongoDB 3.6+
- Replica Set or Sharded Cluster deployment
- No additional permissions needed (unlike oplog)

## Benefits over Oplog

1. **Official API**: Uses MongoDB's official Change Streams API
2. **Better Performance**: More efficient filtering and processing
3. **Simpler Setup**: No need for `MONGO_OPLOG_URL` or special permissions
4. **Works with Atlas**: Compatible with MongoDB Atlas out of the box
5. **Better Reconnection**: Automatic resume token handling

## Migration Path

1. **Phase 1**: Change Streams as opt-in (current)
2. **Phase 2**: Change Streams as default for MongoDB 4.0+
3. **Phase 3**: Gradual oplog deprecation
4. **Phase 4**: Polling as universal fallback

## Fallback Order

1. **Change Streams** (MongoDB 3.6+ with replica set/sharding)
2. **Oplog** (if MONGO_OPLOG_URL is provided)
3. **Polling** (universal fallback)
