// Inspired by the new Blaze test-runner framework
// https://github.com/meteor/blaze/tree/master/tests
// which appears to be partially inspired by the original
// runner.js which used to be here.

const webdriver = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const logging = webdriver.logging;

// From packages/test-in-console/driver.js
const MAGIC_PREFIX = '##_meteor_magic##';

const logOptions = new logging.Preferences();
logOptions.setLevel('browser', logging.Level.ALL);

const options = new chrome.Options();
options.setLoggingPrefs(logOptions);

const driver = new chrome.Driver(options);

const KNOWN_FACILITIES = [
  "xunit",
  "state",
];

const xunits = [];

const MAGIC_REGEX =
  new RegExp(`${MAGIC_PREFIX}\(${KNOWN_FACILITIES.join("|")}\):\(.*\)$`);

const magicEntry = (facility, message) => {
  if (facility === "xunit") {
    xunits.push(facility);
  } else if (facility === "state") {
    console.log(message);
  } else {
    console.log(" [Unknown facility: " + facility + "] " + message);
  }
}

function processLogMagic(magicMessage) {
  const match = MAGIC_REGEX.exec(magicMessage);
  if (!match) {
    return false;
  }

  const facility = match[1];
  const message = match[2];

  magicEntry(facility, message);
  return true;
}

const nonMatchingMessage = (entry, message) =>
  console.log(message || ("    [" + entry.level.name + "] " + entry.message));

function processLogEntry(entry) {
  const logRegexp = /^([^\s]+) ([^\s]+) (")?(.*)\3$/;
  const messageParts = logRegexp.exec(entry.message);
  if (!messageParts) {
    nonMatchingMessage(entry);
    return;
  }

  const url = messageParts[1];
  const errorLoc = messageParts[2];
  const message = messageParts[4];

  if (processLogMagic(message)) {
    return;
  }

  nonMatchingMessage(entry, message);

}

function processLogEntries(entries, thing) {
  return entries.forEach(processLogEntry);
}

const getLogs = () => driver.manage().logs().get("browser");
const handleLogs = () => getLogs().then(processLogEntries);

const endIfDone = (done, timer) => {
  if (!done) return;
  if (timer) clearInterval(timer);

  driver.executeScript(function () {
    if (typeof TEST_STATUS !== "undefined") {
      return TEST_STATUS.FAILURES && true;
    }

    if (typeof FAILURES === "undefined") {
      return true;
    }

    return false;
  }).then(function (failure) {
    handleLogs()
      .then(() => driver.quit())
      .then(() => process.exit(failure ? 1 : 0));
  });
}

const checkDone = () => {
  return driver.executeScript(function() {
    if (typeof TEST_STATUS !== "undefined") {
      return TEST_STATUS.DONE;
    }
    return typeof DONE !== "undefined" && DONE;
  });
}

const targetUrl = process.env.URL || "http://localhost:3000";

driver.get(targetUrl).then(() => {
  const pollTimer = setInterval(() => {
    handleLogs()
      .then(checkDone)
      .then((done) => endIfDone(pollTimer))
  }, 500);
});
