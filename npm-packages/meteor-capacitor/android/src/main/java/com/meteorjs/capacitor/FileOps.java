/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

package com.meteorjs.capacitor;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.UUID;

final class FileOps {

    private static final int COPY_BUFFER_SIZE = 16 * 1024;

    private FileOps() {}

    static void copy(InputStream inputStream, File to) throws IOException {
        ensureParentDirectory(to);
        File tempFile = createTempSibling(to);

        try (InputStream source = inputStream; OutputStream output = new FileOutputStream(tempFile)) {
            byte[] buffer = new byte[COPY_BUFFER_SIZE];
            int read;
            while ((read = source.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            output.flush();
        } catch (IOException e) {
            deleteRecursively(tempFile);
            throw e;
        }

        if (to.exists() && !deleteRecursively(to)) {
            deleteRecursively(tempFile);
            throw new IOException("Failed to delete existing file: " + to.getAbsolutePath());
        }

        moveAtomicallyOrCopyDelete(tempFile, to);
    }

    static void copy(File from, File to) throws IOException {
        if (from.isDirectory()) {
            copyDirectory(from, to);
            return;
        }

        try (InputStream inputStream = new FileInputStream(from)) {
            copy(inputStream, to);
        }
    }

    static void moveAtomicallyOrCopyDelete(File from, File to) throws IOException {
        ensureParentDirectory(to);

        if (to.exists() && !deleteRecursively(to)) {
            throw new IOException("Failed to replace existing file: " + to.getAbsolutePath());
        }

        if (from.renameTo(to)) {
            return;
        }

        if (from.isDirectory()) {
            copyDirectory(from, to);
        } else {
            copyFileWithoutRename(from, to);
        }

        if (!deleteRecursively(from)) {
            throw new IOException("Failed to delete source after copy: " + from.getAbsolutePath());
        }
    }

    static boolean deleteRecursively(File root) {
        if (root == null || !root.exists()) {
            return true;
        }

        if (root.isDirectory()) {
            File[] children = root.listFiles();
            if (children != null) {
                for (File child : children) {
                    if (!deleteRecursively(child)) {
                        return false;
                    }
                }
            }
        }

        return root.delete();
    }

    static void ensureParentDirectory(File file) throws IOException {
        File parent = file.getParentFile();
        if (parent == null) {
            return;
        }

        if (parent.exists()) {
            if (!parent.isDirectory()) {
                throw new IOException("Parent path is not a directory: " + parent.getAbsolutePath());
            }
            return;
        }

        if (!parent.mkdirs() && !parent.isDirectory()) {
            throw new IOException("Failed to create parent directory: " + parent.getAbsolutePath());
        }
    }

    private static File createTempSibling(File target) {
        File parent = target.getParentFile();
        String suffix = ".tmp-" + UUID.randomUUID();
        return new File(parent, target.getName() + suffix);
    }

    private static void copyDirectory(File fromDir, File toDir) throws IOException {
        if (!fromDir.isDirectory()) {
            throw new IOException("Source is not a directory: " + fromDir.getAbsolutePath());
        }

        if (!toDir.exists() && !toDir.mkdirs() && !toDir.isDirectory()) {
            throw new IOException("Failed to create directory: " + toDir.getAbsolutePath());
        }

        File[] children = fromDir.listFiles();
        if (children == null) {
            return;
        }

        for (File child : children) {
            File childTarget = new File(toDir, child.getName());
            if (child.isDirectory()) {
                copyDirectory(child, childTarget);
            } else {
                copy(child, childTarget);
            }
        }
    }

    private static void copyFileWithoutRename(File from, File to) throws IOException {
        ensureParentDirectory(to);
        try (InputStream inputStream = new FileInputStream(from); OutputStream output = new FileOutputStream(to)) {
            byte[] buffer = new byte[COPY_BUFFER_SIZE];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            output.flush();
        }
    }
}
