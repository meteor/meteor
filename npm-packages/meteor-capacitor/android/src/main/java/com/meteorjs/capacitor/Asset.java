/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

package com.meteorjs.capacitor;

import java.io.File;
import java.util.Objects;

final class Asset {

    final AssetBundle bundle;
    final String filePath;
    final String urlPath;
    final String fileType;
    final boolean cacheable;
    final String hash;
    final String sourceMapUrlPath;

    Asset(
        AssetBundle bundle,
        String filePath,
        String urlPath,
        String fileType,
        boolean cacheable,
        String hash,
        String sourceMapUrlPath
    ) {
        this.bundle = bundle;
        this.filePath = filePath;
        this.urlPath = urlPath;
        this.fileType = fileType;
        this.cacheable = cacheable;
        this.hash = hash;
        this.sourceMapUrlPath = sourceMapUrlPath;
    }

    File getFile() {
        return bundle.resolveFile(filePath);
    }

    @Override
    public String toString() {
        return urlPath;
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) {
            return true;
        }
        if (!(object instanceof Asset)) {
            return false;
        }
        Asset other = (Asset) object;
        return Objects.equals(bundle, other.bundle) && Objects.equals(urlPath, other.urlPath);
    }

    @Override
    public int hashCode() {
        return Objects.hash(bundle, urlPath);
    }
}
