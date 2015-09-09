var _ = require("cordova-plugin-meteor-webapp-tests.underscore");

exports.defineAutoTests = function() {
  describe("WebAppCordova", function() {
    beforeAll(function() {
      jasmine.addMatchers(customMatchers);
    });

    it("should be defined", function() {
      expect(WebAppCordova).toBeDefined();
    });

    describe("the local server", function() {
      it("should serve index.html for /", function(done) {
        fetchFromLocalServer("/").then(expectIndexPageToBeServed(done));
      });

      it("should serve assets based on the URL in the manifest", function(done) {
        // The file path is app/some-file, while the URL is /some-file
        fetchFromLocalServer("/some-file").then(function(response) {
          expect(response.status).toBe(200);
          expect(response.headers.get("Cache-Control")).toContain("no-cache");
          response.text().then(function(text) {
            expect(text).toContain("some-file");
            done();
          });
        });
      });

      it("should serve assets from the bundled www directory", function(done) {
        fetchFromLocalServer("/cordova_plugins.js").then(function(response) {
          expect(response.status).toBe(200);
          expect(response.headers.get("Cache-Control")).toContain("no-cache");
          response.text().then(function(text) {
            expect(text).toContain("cordova.define('cordova/plugin_list'");
            done();
          });
        });
      });

      it("should serve index.html for any URL that does not correspond to an asset", function(done) {
        fetchFromLocalServer("/anything").then(expectIndexPageToBeServed(done));
      });

      it("should serve index.html when accessing an asset through /application", function(done) {
        fetchFromLocalServer("/application/packages/meteor.js").then(expectIndexPageToBeServed(done));
      });

      it("should serve index.html for an asset that is not in the manifest", function(done) {
        fetchFromLocalServer("/not-in-manifest").then(expectIndexPageToBeServed(done));
      });

      it("should serve index.html when accessing an asset that is not in the manifest through /application", function(done) {
        fetchFromLocalServer("/application/not-in-manifest").then(expectIndexPageToBeServed(done));
      });

      // Caching

      it("should set the ETag header based on the asset hash", function(done) {
        fetchFromLocalServer("/packages/meteor.js").then(function(response) {
          expect(response.headers.get("ETag")).toContain("57d11a30155349aa5106f8150cee35eac5f4764c");
          done();
        });
      });

      it("should set the Cache-Control header with a max-age of one year for a request with a cache buster", function(done) {
        fetchFromLocalServer("/packages/meteor.js?9418708e9519b747d9d631d85ea85b90c0b5c70c").then(function(response) {
          expect(response.headers.get("Cache-Control")).toContain("max-age=" + oneYearInSeconds);
          done();
        });
      });

      it("should set the Cache-Control: no-cache header for a request without a cache buster", function(done) {
        fetchFromLocalServer("/packages/meteor.js").then(function(response) {
          expect(response.headers.get("Cache-Control")).toContain("no-cache");
          done();
        });
      });

      // Partial requests

      it("should set the Accept-Ranges: bytes header", function(done) {
        fetchFromLocalServer("/packages/meteor.js").then(function(response) {
          expect(response.headers.get("Accept-Ranges")).toEqual("bytes");
          done();
        });
      });

      // Source maps

      it("should set the X-SourceMap header for an asset with a source map", function(done) {
        fetchFromLocalServer("/app/template.mobileapp.js").then(function(response) {
          expect(response.headers.get("X-SourceMap")).toContain("/app/979b20f66caf126704c250fbd29ce253c6cb490e.map");
          done();
        });
      });

      it("should serve the source map for an asset", function(done) {
        fetchFromLocalServer("/app/979b20f66caf126704c250fbd29ce253c6cb490e.map").then(function(response) {
          expect(response.status).toBe(200);
          expect(response.headers.get("Cache-Control")).toContain("max-age=" + oneYearInSeconds);
          response.text().then(function(text) {
            expect(text).toContain('"sources":["meteor://💻app/template.mobileapp.js"]');
            done();
          });
          done();
        });
      });

      // Content types

      describe("when setting the Content-Type header", function() {
        it("should set text/javascript for a manifest entry of type: js", function(done) {
          fetchFromLocalServer("/packages/meteor.js").then(function(response) {
            expect(response.headers.get("Content-Type")).toEqual("text/javascript");
            done();
          });
        });

        it("should set text/css for a manifest entry of type: css", function(done) {
          fetchFromLocalServer("/merged-stylesheets.css").then(function(response) {
            expect(response.headers.get("Content-Type")).toEqual("text/css");
            done();
          });
        });

        describe("for a manifest entry of type: asset", function() {
          it("should set text/html for a .html file", function(done) {
            fetchFromLocalServer("/some-page.html").then(function(response) {
              expect(response.headers.get("Content-Type")).toEqual("text/html");
              done();
            });
          });

          it("should set text/javascript for a .js file", function(done) {
            fetchFromLocalServer("/some-javascript.js").then(function(response) {
              expect(response.headers.get("Content-Type")).toEqual("text/javascript");
              done();
            });
          });

          it("should set text/css for a .css file", function(done) {
            fetchFromLocalServer("/some-stylesheet.css").then(function(response) {
              expect(response.headers.get("Content-Type")).toEqual("text/css");
              done();
            });
          });

          it("should set application/json for a .json file", function(done) {
            fetchFromLocalServer("/some-data.json").then(function(response) {
              expect(response.headers.get("Content-Type")).toEqual("application/json");
              done();
            });
          });

          it("should set text/plain for a .txt file", function(done) {
            fetchFromLocalServer("/some-text.txt").then(function(response) {
              expect(response.headers.get("Content-Type")).toEqual("text/plain");
              done();
            });
          });

          it("should set image/png for a .png file", function(done) {
            fetchFromLocalServer("/some-image.png").then(function(response) {
              expect(response.headers.get("Content-Type")).toEqual("image/png");
              done();
            });
          });

          it("should set image/jpeg for a .jpg file", function(done) {
            fetchFromLocalServer("/some-image.jpg").then(function(response) {
              expect(response.headers.get("Content-Type")).toEqual("image/jpeg");
              done();
            });
          });

          it("should set video/mp4 for a .mp4 file", function(done) {
            fetchFromLocalServer("/some-video.mp4").then(function(response) {
              expect(response.headers.get("Content-Type")).toEqual("video/mp4");
              done();
            });
          });

          xit("should set application/woff for a .woff file", function(done) {
            fetchFromLocalServer("/some-font.woff").then(function(response) {
              expect(response.headers.get("Content-Type")).toEqual("application/woff");
              done();
            });
          });

          it("should set application/octet-stream for files without an extension", function(done) {
            fetchFromLocalServer("/some-file").then(function(response) {
              expect(response.headers.get("Content-Type")).toEqual("application/octet-stream");
              done();
            });
          });
        });
      });
    });

    describe("when updating from the bundled app version to a downloaded version", function() {
      beforeEach(function(done) {
        WebAppMockRemoteServer.serveVersion("version2", done);
      });

      afterEach(function(done) {
        WebAppCordova.resetToInitialState(done);
      });

      it("should only serve the new verson after a page reload", function(done) {
        WebAppCordova.onNewVersionDownloaded(function() {
          expectVersionServedToEqual("version1", function() {
            WebAppCordova.simulatePageReload(function() {
              expectVersionServedToEqual("version2", done);
            });
          });
        });

        WebAppCordova.checkForUpdates();
      });

      it("should only download changed files", function(done) {
        WebAppCordova.onNewVersionDownloaded(function() {
          WebAppMockRemoteServer.receivedRequests(expectPathsForRequestsToMatch([
            "/__cordova/manifest.json",
            "/__cordova/",
            "/__cordova/app/template.mobileapp.js",
            "/__cordova/app/3f6275657e6db3a21acb37d0f6c207cf83871e90.map",
            "/__cordova/some-file",
            "/__cordova/some-other-file"],
            done));
        });

        WebAppCordova.checkForUpdates();
      });

      it("should still serve assets that haven't changed", function(done) {
        WebAppCordova.onNewVersionDownloaded(function() {
          WebAppCordova.simulatePageReload(function() {
            expectAssetToBeServed("some-text.txt", done);
          });
        });

        WebAppCordova.checkForUpdates();
      });

      it("should remember the new version after a restart", function(done) {
        WebAppCordova.onNewVersionDownloaded(function() {
          WebAppCordova.simulateAppRestart(function() {
            expectVersionServedToEqual("version2", done);
          });
        });

        WebAppCordova.checkForUpdates();
      });
    });

    describe("when updating from a downloaded app version to another downloaded version", function() {
      beforeEach(function(done) {
        downloadAndServeVersionLocally("version2", function() {
          WebAppMockRemoteServer.serveVersion("version3", done);
        });
      });

      afterEach(function(done) {
        WebAppCordova.resetToInitialState(done);
      });

      it("should only serve the new verson after a page reload", function(done) {
        WebAppCordova.onNewVersionDownloaded(function() {
          expectVersionServedToEqual("version2", function() {
            WebAppCordova.simulatePageReload(function() {
              expectVersionServedToEqual("version3", done);
            });
          });
        });

        WebAppCordova.checkForUpdates();
      });

      it("should only download changed files", function(done) {
        WebAppCordova.onNewVersionDownloaded(function() {
          WebAppMockRemoteServer.receivedRequests(expectPathsForRequestsToMatch([
            "/__cordova/manifest.json",
            "/__cordova/",
            "/__cordova/app/template.mobileapp.js",
            "/__cordova/app/36e96c1d40459ae12164569599c9c0a203b36db7.map",
            "/__cordova/some-file"],
            done));
        });

        WebAppCordova.checkForUpdates();
      });

      it("should still serve assets that haven't changed", function(done) {
        WebAppCordova.onNewVersionDownloaded(function() {
          WebAppCordova.simulatePageReload(function() {
            expectAssetToBeServed("some-text.txt", done);
          });
        });

        WebAppCordova.checkForUpdates();
      });

      it("should delete the old version after startup completes", function(done) {
        WebAppCordova.onNewVersionDownloaded(function() {
          WebAppCordova.simulatePageReload(function() {
            WebAppCordova.downloadedVersionExists("version2", function(versionExists) {
              expect(versionExists).toBe(true);

              WebAppCordova.startupDidComplete(function() {
                WebAppCordova.downloadedVersionExists("version2", function(versionExists) {
                  expect(versionExists).toBe(false);

                  done();
                });
              });
            });
          });
        });

        WebAppCordova.checkForUpdates();
      });

      it("should remember the new version after a restart", function(done) {
        WebAppCordova.onNewVersionDownloaded(function() {
          WebAppCordova.simulateAppRestart(function() {
            expectVersionServedToEqual("version3", done);
          });
        });

        WebAppCordova.checkForUpdates();
      });
    });

    describe("when checking for updates while there is no new version", function() {
      beforeEach(function(done) {
        downloadAndServeVersionLocally("version2", function() {
          WebAppMockRemoteServer.serveVersion("version2", done);
        });
      });

      afterEach(function(done) {
        WebAppCordova.resetToInitialState(done);
      });

      it("should not invoke the onNewVersionDownloaded callback", function(done) {
        WebAppCordova.onNewVersionDownloaded(function() {
          fail();
          done();
        });

        // Wait 500ms for the test to fail
        waitForTestToFail(500, done);

        WebAppCordova.checkForUpdates();
      });

      it("should not download any files except for the manifest", function(done) {
        setTimeout(function() {
          WebAppMockRemoteServer.receivedRequests(expectPathsForRequestsToMatch([
            "/__cordova/manifest.json"],
            done));
        }, 500);

        WebAppCordova.checkForUpdates();
      });
    });

    describe("when downloading an invalid asset", function() {
      beforeEach(function(done) {
        WebAppMockRemoteServer.serveVersion("version2_with_invalid_asset", done);
      });

      afterEach(function(done) {
        WebAppCordova.resetToInitialState(done);
      });

      it("should invoke the onDownloadFailure callback with an error", function(done) {
        WebAppCordova.onDownloadFailure(function(error) {
          expect(error.message).toEqual("Hash mismatch for asset: app/template.mobileapp.js");
          done();
        });

        WebAppCordova.checkForUpdates();
      });

      it("should not invoke the onNewVersionDownloaded callback", function(done) {
        WebAppCordova.onNewVersionDownloaded(function() {
          fail();
          done();
        });

        // Wait 500ms for the test to fail
        waitForTestToFail(500, done);

        WebAppCordova.checkForUpdates();
      });
    });

    describe("when resuming a partial download with the same version", function() {
      beforeEach(function(done) {
        WebAppCordova.simulatePartialDownload("version2", function() {
          WebAppMockRemoteServer.serveVersion("version2", function() {
            WebAppCordova.onNewVersionDownloaded(done);
            WebAppCordova.checkForUpdates();
          });
        });
      });

      afterEach(function(done) {
        WebAppCordova.resetToInitialState(done);
      });

      it("should only download the manifest, the index page, and the remaining assets", function(done) {
        WebAppMockRemoteServer.receivedRequests(expectPathsForRequestsToMatch([
          "/__cordova/manifest.json",
          "/__cordova/",
          "/__cordova/app/template.mobileapp.js",
          "/__cordova/app/3f6275657e6db3a21acb37d0f6c207cf83871e90.map"],
          done));
      });

      it("should only serve the new verson after a page reload", function(done) {
        expectVersionServedToEqual("version1", function() {
          WebAppCordova.simulatePageReload(function() {
            expectVersionServedToEqual("version2", done);
          });
        });
      });

      it("should serve assets that have been downloaded before", function(done) {
        WebAppCordova.simulatePageReload(function() {
          expectAssetToBeServed("some-file", "some-file (changed)", done);
        });
      });
    });

    describe("when resuming a partial download with a different version", function() {
      beforeEach(function(done) {
        WebAppCordova.simulatePartialDownload("version2", function() {
          WebAppMockRemoteServer.serveVersion("version3", function() {
            WebAppCordova.onNewVersionDownloaded(done);
            WebAppCordova.checkForUpdates();
          });
        });
      });

      afterEach(function(done) {
        WebAppCordova.resetToInitialState(done);
      });

      it("should only download the manifest, the index page, and both remaining and changed assets", function(done) {
        WebAppMockRemoteServer.receivedRequests(expectPathsForRequestsToMatch([
          "/__cordova/manifest.json",
          "/__cordova/",
          "/__cordova/app/template.mobileapp.js",
          "/__cordova/app/36e96c1d40459ae12164569599c9c0a203b36db7.map",
          "/__cordova/some-file"],
          done));
      });

      it("should only serve the new verson after a page reload", function(done) {
        expectVersionServedToEqual("version1", function() {
          WebAppCordova.simulatePageReload(function() {
            expectVersionServedToEqual("version3", done);
          });
        });
      });

      it("should serve assets that have been downloaded before", function(done) {
        WebAppCordova.simulatePageReload(function() {
          expectAssetToBeServed("some-other-file", done);
        });
      });

      it("should serve changed assets even if they have been downloaded before", function(done) {
        WebAppCordova.simulatePageReload(function() {
          expectAssetToBeServed("some-file", "some-file (changed again)", done);
        });
      });
    });
  });
};

// Helpers

var oneYearInSeconds = 60 * 60 * 24 * 365;

function fetchFromLocalServer(path) {
  return fetch("http://localhost:2511" + path);
}

function expectIndexPageToBeServed(done) {
  return function(response) {
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-cache");
    expect(response.headers.get("Content-Type")).toEqual("text/html");
    response.text().then(function(html) {
      expect(html).toContain("<title>mobileapp</title>");
      done();
    });
  };
};

function expectAssetServedToContain(path, expectedContents, done) {
  fetchFromLocalServer(path).then(function(response) {
    expect(response.status).toBe(200);
    response.text().then(function(text) {
      expect(text).toContain(expectedContents);
      done();
    });
  });
}

function expectAssetToBeServed(filename, content, done) {
  if (done == null) {
    done = content;
    content = filename;
  }

  fetchFromLocalServer("/" + filename).then(function(response) {
    expect(response.status).toBe(200);
    response.text().then(function(text) {
      expect(text).toContain(filename);
      done();
    });
  });
}

function downloadAndServeVersionLocally(version, done) {
  WebAppMockRemoteServer.serveVersion(version, function() {
    WebAppCordova.onNewVersionDownloaded(function() {
      WebAppCordova.simulatePageReload(done);
    });

    WebAppCordova.checkForUpdates();
  });
}

function expectVersionServedToEqual(expectedVersion, done) {
  fetchFromLocalServer("/").then(function(response) {
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-cache");
    expect(response.headers.get("Content-Type")).toEqual("text/html");
    response.text().then(function(html) {
      var config = runtimeConfigFromHTML(html);
      var version = config.autoupdateVersionCordova;
      expect(version).toEqual(expectedVersion);
      done();
    });
  });
}

function runtimeConfigFromHTML(html) {
  var regex = /__meteor_runtime_config__ = JSON.parse\(decodeURIComponent\("([^"]*)"\)\)/
  var matches = html.match(regex);
  if (!matches) {
    fail("Can't find __meteor_runtime_config__");
  }
  return JSON.parse(decodeURIComponent(matches[1]));
};

function pathsForRequests(requests) {
  return _.pluck(requests, "path");
}

function expectPathsForRequestsToMatch(expectedPaths, done) {
  return function(requests) {
    var paths = pathsForRequests(requests);
    expect(paths).toMatchArray(expectedPaths);
    done()
  }
}

function waitForTestToFail(delay, done) {
  // Wait delay ms for the test to fail
  setTimeout(function() {
    // Hack to avoid SPEC HAS NO EXPECTATIONS
    expect(true).toBe(true);
    done();
  }, delay);
}

var customMatchers = {
  toMatchArray: function(util, customEqualityTesters) {
    return {
      compare: function(actual, expected) {
        var missingElements = _.difference(expected, actual);
        var extraElements = _.difference(actual, expected);

        var result = {};

        result.pass = _.isEmpty(missingElements) && _.isEmpty(extraElements);

        if (!result.pass) {
          var message = "Expected [" + actual + "] to match [" + expected + "]";

          if (!_.isEmpty(missingElements)) {
            message += ", missing: [" + missingElements + "]";
          }

          if (!_.isEmpty(extraElements)) {
            message += ", extra: [" + extraElements + "]";
          }

          result.message = message;
        }

        return result;
      }
    };
  }
}
