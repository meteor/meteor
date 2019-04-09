exports.URL = global.URL;
exports.URLSearchParams = global.URLSearchParams;

// backwards compatability
Object.assign(exports.URL, require('./bc/url_client'));