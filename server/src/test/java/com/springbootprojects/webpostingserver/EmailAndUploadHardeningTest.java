package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.controller.EmailSettingsController.SendBudget;
import com.springbootprojects.webpostingserver.posts.service.EmailService;
import com.springbootprojects.webpostingserver.posts.service.ImageProcessingService;
import org.junit.jupiter.api.Test;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/** Per-recipient send budget, mail text sanitising and JPEG EXIF stripping. Plain JUnit. */
class EmailAndUploadHardeningTest {

    // ── 1. Send budget ────────────────────────────────────────────────────────

    @Test
    void budgetAllowsThreeAnHourThenBlocksUntilTheHourPasses() {
        SendBudget b = new SendBudget(3, 6);
        long t = 1_000_000_000L;
        for (int i = 0; i < 3; i++) { assertThat(b.allows("a@x.test", t)).isTrue(); b.record("a@x.test", t); }
        assertThat(b.allows("a@x.test", t + 60_000)).isFalse();
        assertThat(b.allows("other@x.test", t)).isTrue();
        assertThat(b.allows("a@x.test", t + 3_600_001L)).isTrue();
    }

    @Test
    void budgetStopsAtSixADay() {
        SendBudget b = new SendBudget(3, 6);
        long t = 0;
        for (int i = 0; i < 6; i++) {
            t += 3_600_001L;   // one per hour so the hourly cap never bites
            assertThat(b.allows("a", t)).isTrue();
            b.record("a", t);
        }
        assertThat(b.allows("a", t + 3_600_001L)).isFalse();
        assertThat(b.allows("a", t + 24 * 3_600_000L)).isTrue();
    }

    // ── 3. Mail text ──────────────────────────────────────────────────────────

    @Test
    void oneLineRemovesControlCharactersAndCaps() {
        String forged = "Nice\r\nBcc: victim@x.test\nWe have reset your password\t\u0000 x";
        String clean = EmailService.oneLine(forged, 150);
        assertThat(clean).doesNotContain("\r", "\n", "\t", "\u0000", " ");
        assertThat(clean).startsWith("Nice Bcc: victim@x.test We have reset");
        assertThat(EmailService.oneLine("a".repeat(500), 150)).hasSize(150);
        assertThat(EmailService.oneLine(null, 150)).isEmpty();
    }

    // ── 4. EXIF ───────────────────────────────────────────────────────────────

    private static byte[] jpeg() throws Exception {
        BufferedImage img = new BufferedImage(40, 30, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < 40; x++) for (int y = 0; y < 30; y++) img.setRGB(x, y, (x * 6) << 16 | (y * 8) << 8 | 90);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageWriter w = ImageIO.getImageWritersByFormatName("jpeg").next();
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
            w.setOutput(ios);
            w.write(null, new IIOImage(img, null, null), w.getDefaultWriteParam());
        } finally { w.dispose(); }
        return out.toByteArray();
    }

    /** Inserts an APP1 Exif segment holding a fake GPS string straight after SOI. */
    private static byte[] withExif(byte[] jpeg, String payload) {
        byte[] body = ("Exif\0\0" + payload).getBytes(StandardCharsets.ISO_8859_1);
        int len = body.length + 2;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(jpeg, 0, 2);
        out.write(0xFF); out.write(0xE1); out.write(len >> 8); out.write(len & 0xFF);
        out.write(body, 0, body.length);
        out.write(jpeg, 2, jpeg.length - 2);
        return out.toByteArray();
    }

    @Test
    void exifIsStrippedAndTheImageStillDecodesIdentically() throws Exception {
        byte[] clean = jpeg();
        byte[] tagged = withExif(clean, "GPSLatitude=51.5074N");
        assertThat(new String(tagged, StandardCharsets.ISO_8859_1)).contains("GPSLatitude");

        ImageProcessingService svc = new ImageProcessingService();
        byte[] out = svc.stripJpegMetadata(tagged, "jpg");

        assertThat(new String(out, StandardCharsets.ISO_8859_1)).doesNotContain("GPSLatitude").doesNotContain("Exif");
        assertThat(out).isEqualTo(clean);   // image data untouched, byte for byte
        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(out));
        assertThat(decoded).isNotNull();
        assertThat(decoded.getWidth()).isEqualTo(40);
    }

    @Test
    void nonJpegAndMalformedInputAreReturnedUnchanged() throws Exception {
        ImageProcessingService svc = new ImageProcessingService();
        byte[] png = "not really a png".getBytes(StandardCharsets.UTF_8);
        assertThat(svc.stripJpegMetadata(png, "png")).isSameAs(png);
        byte[] junk = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE1, 0x7F, 0x00, 1, 2};
        assertThat(svc.stripJpegMetadata(junk, "jpg")).isSameAs(junk);
        byte[] plain = jpeg();
        assertThat(svc.stripJpegMetadata(plain, "jpg")).isSameAs(plain);
    }
}
