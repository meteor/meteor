/**
 *
 * @param id{string}
 * @return {{fromServer: (function(): Error), from: (function(location: string): boolean), fromClient: (function(): Error)}}
 */
export const cannotImport = (id) => {
  /**
   *
   * @param location{string}
   * @return {boolean}
   */
  const from =
    (location) => {
      if (!id) {
        return false;
      }
      return String(id)
        .split('/')
        .some((subPath) => subPath === location);
    };

  const fromClient =
    () => new Error(
      `Unable to import on the client a module from a server directory: ${id}
       (cross-boundary import) see: https://guide.meteor.com/structure.html#special-directories`
    );


  const fromServer =
    () => new Error(
      `Unable to import on the server a module from a client directory: ${id}
       (cross-boundary import) see: https://guide.meteor.com/structure.html#special-directories`
    );

  return {
    from,
    fromClient,
    fromServer
  };
};
