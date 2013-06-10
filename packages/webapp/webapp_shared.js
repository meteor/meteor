Meteor._fixLink = function (link) {
  if (link.substr(0, 1) === "/")
    link = (__meteor_runtime_config__.PATH_PREFIX || "") + link;
  return link;
};
