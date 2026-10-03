package com.springbootprojects.webpostingserver;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

/**
 * A lock shared by every test JVM on this machine. Tests that rewrite global
 * settings (sign-up limits, the verified-email rule) or use fixed names cannot
 * run in two Maven runs at once against the one test database; this makes the
 * second run wait its turn for that class instead of failing.
 */
final class CrossRunLock implements AutoCloseable {

    private final FileChannel channel;
    private final FileLock lock;

    private CrossRunLock(FileChannel channel, FileLock lock) {
        this.channel = channel;
        this.lock = lock;
    }

    static CrossRunLock acquire(String name) throws IOException {
        Path file = Path.of(System.getProperty("java.io.tmpdir"), "webposting-test-" + name + ".lock");
        FileChannel ch = FileChannel.open(file, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
        return new CrossRunLock(ch, ch.lock());   // blocks until the other run lets go
    }

    @Override
    public void close() throws IOException {
        lock.release();
        channel.close();
    }
}
