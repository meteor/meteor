/**
 *
 * @param id{string}
 * @return {{fromServer: (function(): Error), from: (function(location: string): boolean), fromClient: (function(): Error)}}
 */
cannotImport = function (id) {
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
      return String(id)
        .split('/')
        .some(function (subPath) {
          return subPath === location;
        });
    };

  var fromClient =
    function () {
      return new Error(
        'Unable to import on the client a module from a server directory: ' +
        id + ' \n (cross-boundary import) see: https://guide.meteor.com/structure.html#special-directories'
      );
    };


  var fromServer =
    function () {
      return new Error(
        'Unable to import on the server a module from a client directory: ' +
        id + ' \n (cross-boundary import) see: https://guide.meteor.com/structure.html#special-directories'
      );
    };

  return {
    from: from,
    fromClient: fromClient,
    fromServer: fromServer
  };
};
