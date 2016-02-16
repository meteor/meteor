package com.meteor.webapp;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;

import okio.BufferedSink;
import okio.Okio;
import okio.Source;

class IOUtils {
    private static final String LOG_TAG = IOUtils.class.getSimpleName();

    public static String stringFromInputStream(InputStream inputStream) throws IOException {
        assert (inputStream != null);

        BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
        StringBuilder stringBuilder = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            stringBuilder.append(line);
            stringBuilder.append("\n");
        }
        return stringBuilder.toString();
    }

    public static void writeToFile(Source source, File file) throws IOException {
        BufferedSink sink = null;
        try {
            sink = Okio.buffer(Okio.sink(file));
            sink.writeAll(source);
        } finally {
            source.close();
            if (sink != null) {
                sink.close();
            }
        }
    }

    public static void writeToFile(byte[] bytes, File file) throws IOException {
        BufferedSink sink = null;
        try {
            sink = Okio.buffer(Okio.sink(file));
            sink.write(bytes);
        } finally {
            if (sink != null) {
                sink.close();
            }
        }
    }

    public static boolean deleteRecursively(File file) {
        if (file.isDirectory()) {
            for (File child : file.listFiles()) {
                if (!deleteRecursively(child)) {
                    return false;
                }
            }
        }
        return file.delete();
    }
}