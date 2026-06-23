/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

package com.meteorjs.capacitor;

import android.content.SharedPreferences;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

final class WebAppConfiguration {

    private static final String KEY_APP_ID = "MeteorWebAppId";
    private static final String KEY_ROOT_URL = "MeteorWebAppRootURL";
    private static final String KEY_CORDOVA_COMPATIBILITY_VERSION = "MeteorWebAppCordovaCompatibilityVersion";
    private static final String KEY_LAST_DOWNLOADED_VERSION = "MeteorWebAppLastDownloadedVersion";
    private static final String KEY_LAST_SEEN_INITIAL_VERSION = "MeteorWebAppLastSeenInitialVersion";
    private static final String KEY_LAST_KNOWN_GOOD_VERSION = "MeteorWebAppLastKnownGoodVersion";
    private static final String KEY_BLACKLISTED_VERSIONS = "MeteorWebAppBlacklistedVersions";
    private static final String KEY_VERSIONS_TO_RETRY = "MeteorWebAppVersionsToRetry";

    private final SharedPreferences preferences;

    WebAppConfiguration(SharedPreferences preferences) {
        this.preferences = preferences;
    }

    String getAppId() {
        return preferences.getString(KEY_APP_ID, null);
    }

    void setAppId(String appId) {
        setString(KEY_APP_ID, appId);
    }

    String getRootUrlString() {
        return preferences.getString(KEY_ROOT_URL, null);
    }

    void setRootUrlString(String rootUrlString) {
        setString(KEY_ROOT_URL, rootUrlString);
    }

    String getCordovaCompatibilityVersion() {
        return preferences.getString(KEY_CORDOVA_COMPATIBILITY_VERSION, null);
    }

    void setCordovaCompatibilityVersion(String version) {
        setString(KEY_CORDOVA_COMPATIBILITY_VERSION, version);
    }

    String getLastDownloadedVersion() {
        return preferences.getString(KEY_LAST_DOWNLOADED_VERSION, null);
    }

    void setLastDownloadedVersion(String version) {
        setString(KEY_LAST_DOWNLOADED_VERSION, version);
    }

    String getLastSeenInitialVersion() {
        return preferences.getString(KEY_LAST_SEEN_INITIAL_VERSION, null);
    }

    void setLastSeenInitialVersion(String version) {
        setString(KEY_LAST_SEEN_INITIAL_VERSION, version);
    }

    String getLastKnownGoodVersion() {
        return preferences.getString(KEY_LAST_KNOWN_GOOD_VERSION, null);
    }

    void setLastKnownGoodVersion(String version) {
        setString(KEY_LAST_KNOWN_GOOD_VERSION, version);
    }

    Set<String> getBlacklistedVersions() {
        Set<String> versions = preferences.getStringSet(KEY_BLACKLISTED_VERSIONS, Collections.emptySet());
        return new HashSet<>(versions);
    }

    Set<String> getVersionsToRetry() {
        Set<String> versions = preferences.getStringSet(KEY_VERSIONS_TO_RETRY, Collections.emptySet());
        return new HashSet<>(versions);
    }

    void addBlacklistedVersion(String version) {
        Set<String> blacklistedVersions = getBlacklistedVersions();
        Set<String> versionsToRetry = getVersionsToRetry();

        SharedPreferences.Editor editor = preferences.edit();
        if (!versionsToRetry.contains(version) && !blacklistedVersions.contains(version)) {
            versionsToRetry.add(version);
            editor.putStringSet(KEY_VERSIONS_TO_RETRY, versionsToRetry);
            editor.apply();
            return;
        }

        versionsToRetry.remove(version);
        blacklistedVersions.add(version);

        if (versionsToRetry.isEmpty()) {
            editor.remove(KEY_VERSIONS_TO_RETRY);
        } else {
            editor.putStringSet(KEY_VERSIONS_TO_RETRY, versionsToRetry);
        }

        editor.putStringSet(KEY_BLACKLISTED_VERSIONS, blacklistedVersions);
        editor.apply();
    }

    void reset() {
        preferences.edit().clear().apply();
    }

    private void setString(String key, String value) {
        SharedPreferences.Editor editor = preferences.edit();
        if (value == null) {
            editor.remove(key);
        } else {
            editor.putString(key, value);
        }
        editor.apply();
    }
}
