if (typeof Sky === "undefined") Sky = {};

Sky.startup = function (callback) {
  __meteor_bootstrap__.startup_hooks.push(callback);
};
