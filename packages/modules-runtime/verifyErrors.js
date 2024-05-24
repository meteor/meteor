
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

  if(!(id.startsWith('.') || id.startsWith('/'))) {
    throw err;
  }

  if (imports(id).from('node_modules')) {
    // Problem with node modules
    throw err;
  }

  // custom errors
  if (Meteor.isServer && imports(id).from('client')) {
    throw imports(id).fromClientError();
  }
  if (Meteor.isClient && imports(id).from('server')) {
    throw imports(id).fromServerError();
  }

  if (err) {
    throw err;
  }
};
