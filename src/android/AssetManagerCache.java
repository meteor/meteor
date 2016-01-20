package com.meteor.webapp;

import android.content.res.AssetManager;

import java.io.IOException;
import java.io.ObjectInputStream;
import java.util.Map;

class AssetManagerCache {
    private AssetManager assetManager;
    private Map<String, String[]> listCache;

    public AssetManagerCache(AssetManager assetManager) throws IOException {
        this.assetManager = assetManager;

        ObjectInputStream inputStream = null;
        try {
            inputStream = new ObjectInputStream(assetManager.open("cdvasset.manifest"));
            listCache = (Map<String, String[]>) inputStream.readObject();
        } catch (ClassNotFoundException e) {
        } finally {
            if (inputStream != null) {
                try {
                    inputStream.close();
                } catch (IOException e) {
                }
            }
        }
    }

    public boolean exists(String path) {
        if (path.startsWith("/")) {
            path = path.substring(1);
        }

        if (path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }

        String parentPath;
        String filename;

        int parentEndIndex = path.lastIndexOf("/");
        if (parentEndIndex == -1) {
            parentPath = "";
            filename = path;
        } else {
            parentPath = path.substring(0, parentEndIndex);
            filename = path.substring(parentEndIndex + 1);
        }

        String[] children = listCache.get(parentPath);
        if (children == null) return false;

        for (String child : children) {
            if (child.equals(filename)) {
                return true;
            }
        }

        return false;
    }
}
