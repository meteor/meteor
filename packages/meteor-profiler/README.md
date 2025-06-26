# Meteor Profiler

Simple CPU profiling package for Meteor using Node.js Inspector.

## Installation

```bash
meteor add meteor-profiler
```

## Features

- **CPU Profiling**: Generate `.cpuprofile` files for detailed analysis in Chrome DevTools
- **Environment Variable Configuration**: Control profiling through environment variables
- **Async/Promise Support**: Works with both synchronous and asynchronous functions
- **Automatic Cleanup**: Handles profiling session lifecycle automatically
- **Function Wrapping**: Simple API to wrap existing functions

## Basic Usage

### Simple Function Wrapping

```javascript
import { Profile } from 'meteor/meteor-profiler';

// Wrap a function for profiling
const myFunction = Profile('myFunction', function(data) {
  // your logic here
  return processData(data);
});

// Call the wrapped function normally
const result = myFunction(someData);
```

### In Meteor Methods

```javascript
import { Meteor } from 'meteor/meteor';
import { Profile } from 'meteor/meteor-profiler';

Meteor.methods({
  'processData': Profile('processData', function() {
    // Your method logic here
    return expensiveOperation();
  })
});
```

### With Async Functions

```javascript
import { Profile } from 'meteor/meteor-profiler';

const fetchExternalData = Profile('fetchExternal', async function(url) {
  const response = await fetch(url);
  return await response.json();
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

### Enable CPU Profiling

To generate `.cpuprofile` files, set the `METEOR_INSPECT` environment variable with the function names you want to profile:

```bash
METEOR_INSPECT=processData,otherFunction meteor
```

### Environment Variables

```bash
# Enable inspector profiling for specific functions (comma-separated)
METEOR_INSPECT=processData,myFunction,anotherFunction

# Set context for file identification (optional)
METEOR_INSPECT_CONTEXT=development

# Set output directory (default: ./profiling)
METEOR_INSPECT_OUTPUT=/path/to/profiles

# Sampling interval in ms (optional, default: Node.js default)
METEOR_INSPECT_INTERVAL=1000
```

## How It Works

1. **Function Wrapping**: The `Profile` function wraps your existing functions
2. **Conditional Profiling**: Only functions listed in `METEOR_INSPECT` are actually profiled
3. **CPU Profile Generation**: When enabled, generates `.cpuprofile` files using Node.js Inspector
4. **Automatic Cleanup**: Handles starting/stopping profiling sessions automatically

## Analyzing Results

### .cpuprofile Files

Generated files are saved in the `profiling` directory (or custom path) and can be opened in Chrome DevTools:

1. Open Chrome DevTools (F12)
2. Go to "Performance" tab
3. Click the "Load Profile" button (⬆️ icon)
4. Select your `.cpuprofile` file

### File Naming Convention

Files are named: `{functionName}-{context}-{timestamp}.cpuprofile`

Example: `processData-development-2025-06-26T15-30-45-123Z.cpuprofile`

## Example Output

When profiling is active, you'll see console output like:

```
[PROFILING_SAVE] Profile for processData saved in: /path/to/profiling/processData-development-2025-06-26T15-30-45-123Z.cpuprofile
[PROFILING_SAVE] Duration: 1234ms, size: 0.45MB
```

## Important Notes

### Current Limitations

- **Server-only**: Profiling only works on the server side
- **Single session**: Only one profiling session can be active at a time
- **Function-level**: Profiling is per-function, not hierarchical
- **Manual activation**: Must specify function names in `METEOR_INSPECT`

### Performance Impact

- **Minimal overhead**: When `METEOR_INSPECT` is not set, there's virtually no performance impact
- **Memory usage**: Active profiling consumes memory proportional to execution time and sampling rate
- **CPU overhead**: Inspector profiling adds some CPU overhead during active sessions

## Development

### Contributing

To contribute to the package:

```bash
# Clone the Meteor repository
git clone https://github.com/meteor/meteor.git

# Navigate to the package
cd meteor/packages/meteor-profiler

# Test your changes
meteor test-packages ./
```

### Testing the Package

```bash
# In a test Meteor app
meteor add meteor-profiler

# Create a test method and run with profiling
METEOR_INSPECT=testMethod meteor
```

## Troubleshooting

### No .cpuprofile files generated
- Ensure `METEOR_INSPECT` includes the exact function name used in `Profile()`
- Check that the output directory is writable
- Verify the function is actually being called

### Memory issues
- Reduce sampling frequency with `METEOR_INSPECT_INTERVAL`
- Profile shorter durations
- Ensure proper cleanup by not interrupting the process abruptly

### Permission errors
- Check write permissions for the output directory
- Try specifying a different output path with `METEOR_INSPECT_OUTPUT`

## License

This package is part of the Meteor project and is licensed under the MIT license.