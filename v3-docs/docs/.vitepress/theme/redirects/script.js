import redirects from "./redirects.json";
/**
 *
 * @param {string} path
 */
export const redirect = (path) => {
  const lastPath = path.split("/").pop().split(".")[0];
  if (redirects[lastPath]) {
    return {
      path: path.replace(lastPath, redirects[lastPath]),
      shouldRedirect: true,
    };
  }

  if (path.includes("_")) {
    return {
      path: path.replace("_", "-"),
      shouldRedirect: true,
    };
  }

  return {
    path,
    shouldRedirect: false,
  };
};
