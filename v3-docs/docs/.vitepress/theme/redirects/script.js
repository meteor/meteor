// import json from './redirects.json';
/**
 *
 * @param {string} path
 */
export const redirect = (path) => {
  let shouldRedirect = false;
  console.log(path)
  if (path.includes("_")) {
    shouldRedirect = true;
    path = path.replace("_", "-");
  }

  return {
    path,
    shouldRedirect
  };
};
