URL = global.URL;
URLSearchParams = global.URLSearchParams;

exports.URL = URL;
exports.URLSearchParams = URLSearchParams;

// backwards compatibility
Object.assign(URL, require('./bc/url_client'));
