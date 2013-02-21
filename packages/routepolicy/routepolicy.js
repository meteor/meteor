(function () {

  // The route policy is a singleton in a running application, but we
  // can't unit test the real singleton because messing with the real
  // routes would break tinytest... so allow policy instances to be
  // constructed for testing.

  Meteor.__RoutePolicyConstructor = function () {
    var self = this;
    self.urlPrefixTypes = {};
  };

  _.extend(Meteor.__RoutePolicyConstructor.prototype, {

    urlPrefixMatches: function (urlPrefix, url) {
      return url.substr(0, urlPrefix.length) === urlPrefix;
    },

    checkType: function (type) {
      if (! _.contains(['network'], type))
        return 'the route type must be "network"';
      return null;
    },

    checkUrlPrefix: function (urlPrefix) {
      var self = this;
      if (urlPrefix.charAt(0) !== '/')
        return 'a route URL prefix must begin with a slash';
      if (urlPrefix === '/')
        return 'a route URL prefix cannot be /';
      if (self.urlPrefixTypes[urlPrefix] && self.urlPrefixTypes[urlPrefix] !== type)
        return 'the route URL prefix ' + urlPrefix + ' has already been declared to be of type ' + type;
      return null;
    },

    checkForConflictWithStatic: function (urlPrefix, type, _testManifest) {
      var self = this;
      var manifest = _testManifest || __meteor_bootstrap__.bundle.manifest;
      var conflict = _.find(manifest, function (resource) {
        return (resource.type === 'static' &&
                resource.where === 'client' &&
                self.urlPrefixMatches(urlPrefix, resource.url));
      });
      if (conflict)
        return ('static resource ' + conflict.url + ' conflicts with ' +
                type + ' route ' + urlPrefix);
      else
        return null;
    },

    declare: function (urlPrefix, type) {
      var self = this;
      var problem = self.checkType(type) ||
                    self.checkUrlPrefix(urlPrefix) ||
                    self.checkForConflictWithStatic(urlPrefix, type);
      if (problem)
        throw new Error(problem);
      // TODO overlapping prefixes, e.g. /foo/ and /foo/bar/
      self.urlPrefixTypes[urlPrefix] = type;
    },

    classify: function (url) {
      var self = this;
      if (url.charAt(0) !== '/')
        throw new Error('url must be a relative URL: ' + url);
      var prefix = _.find(_.keys(self.urlPrefixTypes), function (_prefix) {
        return self.urlPrefixMatches(_prefix, url);
      });
      if (prefix)
        return self.urlPrefixTypes[prefix];
      else
        return null;
    },

    urlPrefixesFor: function (type) {
      var self = this;
      var prefixes = [];
      _.each(self.urlPrefixTypes, function (_type, _prefix) {
        if (_type === type)
          prefixes.push(_prefix);
      });
      return prefixes.sort();
    }
  });

  __meteor_bootstrap__._routePolicy = Meteor._routePolicy =
    new Meteor.__RoutePolicyConstructor();

})();
