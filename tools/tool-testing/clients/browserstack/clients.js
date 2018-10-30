// This represents a list of configurations which we'd like to test
// using BrowserStack automation.  Each element represents two
// parts, the "selenium" settings and the "browserstack" settings.
// Although these are all flattened into the "capabilities" when sent
// to BrowserStack, the "selenium" settings are considered to be
// specific to selenium and the "browserstack" settings are
// BrowserStack specific.
//
// Selenium's documentation of these properities can be found at:
// https://github.com/SeleniumHQ/selenium/wiki/DesiredCapabilities
//
// BrowserStack's documentation of these properties can be found at:
// https://www.browserstack.com/automate/capabilities.
//
// Available devices and platforms are listed at:
// https://www.browserstack.com/list-of-browsers-and-platforms?product=automate

module.exports = [
  {
    selenium: {
      platform: "ANY",
      browserName: "firefox",
    },
  },
  {
    selenium: {
      platform: "ANY",
      browserName: "chrome",
    },
  },
  {
    selenium: {
      platform: "WINDOWS",
      browserName: "internet explorer",
      version: "11",
    },
  },
  {
    selenium: {
      platform: "WINDOWS",
      browserName: "internet explorer",
      version: "9",
    },
  },
  {
    selenium: {
      platform: "MAC",
      browserName: "safari",
    },
  },
  {
    selenium: {
      platform: "ANY",
      browserName: "android",
    },
    browserstack: {
      device: "Samsung Galaxy S7",
      realMobile: true
    },
  },
];
