/**
 *
 * @param id{string}
 * @return {{fromServer: (function(): Error), from: (function(location: string): boolean), fromClient: (function(): Error)}}
 */
imports = function (id) {
  /**
   *
   * @param location{string}
   * @return {boolean}
   */
  var from =
    function (location) {
      if (!id) {
        return false;
      }

      // XXX: removed last part of path so that it does not trigger false positives
      var path = String(id).split('/').slice(0, -1);

      return path.some(function (subPath) {
        return subPath === location;
      });
    };

  var fromClientError =
    function () {
      return new Error(
        'Unable to import on the server a module from a client directory: "' + id + '" \n (cross-boundary import) see: https://guide.meteor.com/structure.html#special-directories'
      );
    };


  var fromServerError =
    function () {
      return new Error(
        'Unable to import on the client a module from a server directory: "' + id + '" \n (cross-boundary import) see: https://guide.meteor.com/structure.html#special-directories'
      );
    };

  return {
    from: from,
    fromClientError: fromClientError,
    fromServerError: fromServerError
  };
};
