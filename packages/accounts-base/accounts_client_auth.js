/**
 * @summary Fetch helper that automatically adds the auth token to the request headers
 * @param {string|Request} url - The URL to fetch or a Request object
 * @param {Object} [options] - The options for the fetch request
 * @returns {Promise<Response>} - The fetch response
 */
export const fetchWithAuth = async (url, options = {}) => {
  const token = localStorage.getItem("Meteor.loginToken")
    || sessionStorage.getItem("Meteor.loginToken");

  // Create headers object
  const headers = new Headers(options.headers || {});

  // Add auth token if available
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Call fetch with modified options
  return fetch(url, { ...options, headers });
};
