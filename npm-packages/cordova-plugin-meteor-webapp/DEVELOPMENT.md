# `cordova-plugin-meteor-webapp` Development

## Setup

1) Start with a cloned copy of the `cordova-plugin-meteor-webapp` repo:

```
cd ~
git clone https://github.com/meteor/cordova-plugin-meteor-webapp.git
```

2) Make sure the `GCDWebServer` submodule is pulled in:

```
cd cordova-plugin-meteor-webapp
git submodule update --init --recursive
```

## Running npm Tests

1) Install dependencies
```
npm install
```

2) Install devDependencies from package.json globally one by one
```
npm install -g xxx
```

Filipe: I'm not sure why it's only working when installed globally

3) Run the tests
```
npm test
```

## Running iOS Tests

1) Create a new test Cordova app:

```
cd ~
cordova create test-app
```

2) Add the `cordova-plugin-meteor-webapp`, `cordova-plugin-meteor-webapp-tests`, and `cordova-plugin-test-framework` plugins:

```
cd test-app
cordova plugin add https://github.com/apache/cordova-plugin-test-framework.git
cordova plugin add ../cordova-plugin-meteor-webapp/
cordova plugin add ../cordova-plugin-meteor-webapp/tests
```

3) Add the `ios` platform:

```
cordova platform add ios
```

4) Add a [`build.json`](https://cordova.apache.org/docs/en/latest/guide/platforms/ios/#using-buildjson) file to the root of your `test-app`, that includes your Apple Developer Team ID:

```json
{
  "ios": {
    "debug": {
      "developmentTeam": "ABC123DEF456"
    },
    "release": {
      "developmentTeam": "ABC123DEF456",
      "codeSignIdentity": "iPhone Developer",
      "packageType": "ad-hoc"
    }
  }
}
```

5) Update the `test-app`'s `config.xml` to point to the test runner:

Change

```xml
<content src="index.html" />
```

to

```xml
<content src="cdvtests/index.html" />
```

6) Run the tests on a device or using the iOS emulator:

```
cordova emulate ios
```
