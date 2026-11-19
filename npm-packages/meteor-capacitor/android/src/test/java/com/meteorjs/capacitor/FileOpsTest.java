package com.meteorjs.capacitor;

import org.junit.After;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class FileOpsTest {

    private final File root = new File(System.getProperty("java.io.tmpdir"), "fileops-test-" + System.nanoTime());

    @After
    public void cleanup() {
        FileOps.deleteRecursively(root);
    }

    @Test
    public void copyInputStreamCreatesTargetAndParent() throws Exception {
        File target = new File(root, "a/b/c.txt");
        byte[] payload = "hello-world".getBytes(StandardCharsets.UTF_8);

        FileOps.copy(new ByteArrayInputStream(payload), target);

        assertTrue(target.exists());
        assertEquals("hello-world", new String(java.nio.file.Files.readAllBytes(target.toPath()), StandardCharsets.UTF_8));
    }

    @Test
    public void moveAtomicallyOrCopyDeleteMovesDirectoryTree() throws Exception {
        File sourceDir = new File(root, "source");
        File targetDir = new File(root, "target");
        File sourceFile = new File(sourceDir, "nested/file.txt");

        FileOps.copy(new ByteArrayInputStream("data".getBytes(StandardCharsets.UTF_8)), sourceFile);
        FileOps.moveAtomicallyOrCopyDelete(sourceDir, targetDir);

        assertTrue(new File(targetDir, "nested/file.txt").exists());
        assertTrue(!sourceDir.exists());
    }
}
