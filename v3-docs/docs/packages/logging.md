# Logging

The `logging` package provides a standardised way for you to log and display in console various message from your application.
The added benefit is that among other data it will show you the location where the log was fired,
this is useful during debugging to quickly locate where the message is coming from.

Start by installing the package:

```bash
meteor add logging
```

You can then import the utility anywhere in you code like this:
```javascript
import { Log } from 'meteor/logging'
```

You can then call the logging functions in one of the following ways:
```javascript
Log('starting up') // or Log.info('starting up')
Log.error('error message')
Log.warn('warning')
Log.debug('this will show only in development')
```

Besides passing in strings, you can also pass in objects. This has few exceptions and special functions associated.
First in the root of the object the following keys are not allowed:
```javascript
'time', 'timeInexact', 'level', 'file', 'line', 'program', 'originApp', 'satellite', 'stderr'
```

On the other hand there is `message` and `app`, which are also reserved, but they will display in more prominent manner:
```javascript
Log.info({message: 'warning', app: 'DESKTOP', error: { property1: 'foo', property2: 'bar', property3: { foo: 'bar' }} })
```
will turn into:
```shell
E20200519-17:57:41.655(9) [DESKTOP] (main.js:36) warning {"error":{"property1":"foo","property2":"bar","property3":{"foo":"bar"}}}
```

The display of each log is color coded. Info is `blue`, warn is `magenta`, debug is `green` and error is in `red`.

### Log.debug
The `Log.debug()` logging is different from the other calls as these messages will not be displayed in production.
