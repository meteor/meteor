import * as E from './errors';

/**
 *
 * @param id{string}
 */
export const verifyErrors = (id) => {
  if (id && id.startsWith('meteor/')) {
    throw E.cannotFindMeteorPackage(id);
  }
  if (E.cannotImport(id)
    .from('client')) {
    throw E.cannotImport(id)
      .fromClient();
  }
  if (E.cannotImport(id)
    .from('server')) {
    throw E.cannotImport(id)
      .fromServer();
  }
};
