
/**
 *
 * @param id{string}
 * @param parentId{string}
 * @param err {Error}
 */
verifyErrors = function (id, parentId,err)  {
  if (id && id.startsWith('meteor/')) {
    throw cannotFindMeteorPackage(id);
  }
  if (cannotImport(id).from('client')) {
    throw cannotImport(id).fromClient();
  }
  if (cannotImport(id).from('server')) {
    throw cannotImport(id).fromServer();
  }
  if (err) {
    throw err;
  }
};
