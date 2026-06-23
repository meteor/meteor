/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

package com.meteorjs.capacitor;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class WebAppUtils {
    private static final Pattern QUERY_STRING_PATTERN = Pattern.compile("(/[^?]+).*");
    private static final Pattern ETAG_SHA1_PATTERN = Pattern.compile("\"([0-9a-f]{40})\"");

    private WebAppUtils() {}

    static String removeQueryStringFromUrlPath(String urlPath) {
        Matcher matcher = QUERY_STRING_PATTERN.matcher(urlPath);
        if (!matcher.matches()) {
            return urlPath;
        }
        return matcher.group(1);
    }

    static String sha1FromEtag(String etag) {
        if (etag == null) {
            return null;
        }

        Matcher matcher = ETAG_SHA1_PATTERN.matcher(etag);
        if (!matcher.find()) {
            return null;
        }
        return matcher.group(1);
    }
}
