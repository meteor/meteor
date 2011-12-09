if (typeof Sky === "undefined") Sky = {};

Sky.startup = function (callback) {
  // defer so that we don't kill what is running when startup is
  // called. this way things don't break, but we still get an error
  // on the console.
  _.defer(function () {
    throw new Error("Sky.startup not supported on the client. Use jQuery.ready() or an equivalent method.");
  });
};
