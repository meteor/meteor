# Meteor Profiler

Simple CPU profiling package for Meteor using Node.js Inspector.

## Installation

```bash
meteor add meteor-profiler
```

## Features

- **Hierarchical Profiling**: Track time spent in different parts of code with hierarchical structure
- **CPU Profiling**: Generate `.cpuprofile` files for detailed analysis in Chrome DevTools
- **Async/Await Support**: Works with both synchronous and asynchronous functions
- **Detailed Reports**: Visualize where time is being spent in your application
- **Environment Variable Configuration**: Full control through environment variables

## Basic Usage

### Simple Profiling

```javascript
import { Profile } from 'meteor/meteor-profiler';

// Wrap a function for profiling
const myFunction = Profile('myFunction', function(data) {
  // your logic here
  return processData(data);
});

// Or use Profile.time for inline profiling
function myMethod() {
  return Profile.time('myMethod', () => {
    // code to be profiled
    return doSomething();
  });
}
```

### Session Profiling

```javascript
import { Profile } from 'meteor/meteor-profiler';

// Run a complete profiling session
Profile.run('myOperation', () => {
  // All code here will be profiled
  const result1 = Profile.time('step1', () => step1());
  const result2 = Profile.time('step2', () => step2());
  return combineResults(result1, result2);
});
```

### Dynamic Bucket Names

```javascript
const processUser = Profile(function(userId) {
  return `processUser:${userId}`;
}, function(userId) {
  // process specific user
  return Users.findOne(userId);
});
```

## Configuration

### Basic Profiling

Enable basic profiling by setting the environment variable:

```bash
METEOR_PROFILE=1 meteor
```

### Advanced Profiling with Inspector

To generate `.cpuprofile` files for analysis in Chrome DevTools:

```bash
METEOR_INSPECT=methodName,otherMethod meteor
```

### Complete Environment Variables

```bash
# Enable basic profiling (minimum time in ms to appear in reports)
METEOR_PROFILE=100

# Enable inspector profiling for specific methods
METEOR_INSPECT=bundler.bundle,compile.js

# Set context for file identification
METEOR_INSPECT_CONTEXT=development

# Set output directory (default: .meteor/profiling)
METEOR_INSPECT_OUTPUT=/path/to/profiles

# Sampling interval in ms (lower = more details, more memory)
METEOR_INSPECT_INTERVAL=1000

# Maximum profile size in MB
METEOR_INSPECT_MAX_SIZE=2000
```

## Analyzing Results

### Hierarchical Report

The profiler generates a hierarchical report showing where time was spent:

```
| myOperation: 1,234 ms (1)
| ├─ step1: 800 ms (1)
| │  ├─ database.query: 600 ms (3)
| │  └─ other step1: 200 ms
| ├─ step2: 300 ms (1)
| └─ other myOperation: 134 ms
```

### Leaf Report

Shows total time spent in specific operations:

```
| Top leaves:
| database.query...........................600 ms (3)
| template.render..........................350 ms (12)
| network.request..........................280 ms (5)
```

### .cpuprofile Files

Generated files can be opened in Chrome DevTools:

1. Open Chrome DevTools
2. Go to "Performance" or "Profiler" tab
3. Click "Load Profile"
4. Select the `.cpuprofile` file

## Usage Examples

### In Meteor Methods

```javascript
import { Meteor } from 'meteor/meteor';
import { Profile } from 'meteor/meteor-profiler';

Meteor.methods({
  'users.process': Profile('users.process', function(userId) {
    const user = Profile.time('users.fetch', () => {
      return Meteor.users.findOne(userId);
    });
    
    const result = Profile.time('users.calculate', () => {
      return calculateUserStats(user);
    });
    
    Profile.time('users.save', () => {
      Meteor.users.update(userId, { $set: { stats: result } });
    });
    
    return result;
  })
});
```

### In Publications

```javascript
import { Meteor } from 'meteor/meteor';
import { Profile } from 'meteor/meteor-profiler';

Meteor.publish('userData', Profile('pub.userData', function(userId) {
  return Profile.time('userData.query', () => {
    return Meteor.users.find({ _id: userId });
  });
}));
```

### With Async/Await

```javascript
import { Profile } from 'meteor/meteor-profiler';

const fetchExternalData = Profile('fetchExternal', async function(url) {
  const response = await Profile.time('http.request', async () => {
    return fetch(url);
  });
  
  return await Profile.time('response.json', async () => {
    return response.json();
  });
});
```

## Performance Tips

1. **Use appropriate filters**: Configure `METEOR_PROFILE` with a suitable minimum value (e.g., 100ms) to avoid noise
2. **Limit inspector profiling**: Use `METEOR_INSPECT` only for specific methods you want to analyze in detail
3. **Adjust interval**: For long-duration analyses, increase `METEOR_INSPECT_INTERVAL` to reduce memory usage
4. **Monitor size**: Very large profiles can cause memory issues; adjust `METEOR_INSPECT_MAX_SIZE`

## Limitations

- Inspector profiling (`.cpuprofile`) only works on the server
- Very large profiles can consume a lot of memory
- Profiling overhead can affect performance in very tight loops

## Development

To contribute to the package:

```bash
# Clone the Meteor repository
git clone https://github.com/meteor/meteor.git

# The package is in packages/meteor-profiler
cd meteor/packages/meteor-profiler

# Run tests
meteor test-packages ./
```

## License

This package is part of the Meteor project and is licensed under the same MIT license.
