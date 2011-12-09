if (typeof Sky === "undefined") Sky = {};

Sky.startup = function (callback) {
  __skybreak_bootstrap__.startup_hooks.push(callback);
};
