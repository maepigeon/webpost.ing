package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.service.ImageProcessingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.*;

/**
 * Covers upload verification and variant generation.
 *
 * Plain JUnit — the service has no Spring dependencies beyond one @Value, which
 * is set directly, so there is no context to start.
 */
class ImageProcessingServiceTest {

    ImageProcessingService service;

    @TempDir
    Path uploadDir;

    @BeforeEach
    void setUp() {
        service = new ImageProcessingService();
        ReflectionTestUtils.setField(service, "variantsEnabled", true);
    }

    /** A real, decodable image of the given size. */
    private static byte[] image(int width, int height, String format) throws IOException {
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.decode("#4b44cc"));
        g.fillRect(0, 0, width, height);
        g.setColor(Color.WHITE);
        g.fillOval(width / 4, height / 4, width / 2, height / 2);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, format, out);
        return out.toByteArray();
    }

    // ── Dimension reading ─────────────────────────────────────────────────────

    @Test
    void readsDimensionsFromTheHeader() throws IOException {
        assertThat(service.readDimensions(image(320, 200, "png")))
                .isEqualTo(new ImageProcessingService.Dimensions(320, 200));
    }

    @Test
    void returnsNullDimensionsForSomethingThatIsNotAnImage() {
        assertThat(service.readDimensions("hello".getBytes(StandardCharsets.UTF_8))).isNull();
    }

    // ── Profile pictures ──────────────────────────────────────────────────────

    @Test
    void compressesABigPhotoToASmallSquareJpeg() throws IOException {
        byte[] big = image(3000, 2000, "png");
        var out = service.compressSquare(big, 512);
        assertThat(out).isNotNull();
        assertThat(out.extension()).isEqualTo(".jpg");
        assertThat(service.readDimensions(out.bytes())).isEqualTo(new ImageProcessingService.Dimensions(512, 512));
        assertThat(out.bytes().length).isLessThan(big.length);
    }

    @Test
    void keepsASmallPictureItsSizeAndTransparencyAsPng() throws IOException {
        BufferedImage img = new BufferedImage(100, 80, BufferedImage.TYPE_INT_ARGB);   // all transparent
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(img, "png", png);
        var out = service.compressSquare(png.toByteArray(), 512);
        assertThat(out.extension()).isEqualTo(".png");
        assertThat(service.readDimensions(out.bytes())).isEqualTo(new ImageProcessingService.Dimensions(80, 80));
    }

    @Test
    void cannotCompressWhatItCannotDecode() {
        assertThat(service.compressSquare("hello".getBytes(StandardCharsets.UTF_8), 512)).isNull();
    }

    // ── Pixel budget ──────────────────────────────────────────────────────────

    @Test
    void acceptsAnOrdinaryPhoto() {
        assertThat(service.isWithinPixelBudget(new ImageProcessingService.Dimensions(4000, 3000))).isTrue();
    }

    @Test
    void budgetIsSixteenMegapixels() {
        assertThat(service.isWithinPixelBudget(new ImageProcessingService.Dimensions(4000, 4000))).isTrue();
        assertThat(service.isWithinPixelBudget(new ImageProcessingService.Dimensions(4001, 4000))).isFalse();
        assertThat(service.isWithinPixelBudget(new ImageProcessingService.Dimensions(6000, 4000))).isFalse();
    }

    @Test
    void atMostTwoDecodesRunAtOnceAndTheRestAreTurnedAway() throws Exception {
        ReflectionTestUtils.setField(service, "decodeWaitMillis", 50L);
        java.util.concurrent.Semaphore slots = (java.util.concurrent.Semaphore) ReflectionTestUtils.getField(service, "decodeSlots");
        assertThat(slots.availablePermits()).isEqualTo(2);
        byte[] png = image(40, 40, "png");

        slots.acquire(2);   // two decodes in progress
        try {
            assertThatThrownBy(() -> service.decodesCleanly(png, "png"))
                    .isInstanceOf(ImageProcessingService.BusyException.class)
                    .hasMessage("Busy, try again in a moment");
            assertThatThrownBy(() -> service.writeVariants(image(2400, 1600, "jpg"), uploadDir, "busy", "jpg"))
                    .isInstanceOf(ImageProcessingService.BusyException.class);
        } finally {
            slots.release(2);
        }
        assertThat(service.decodesCleanly(png, "png")).isTrue();
        assertThat(slots.availablePermits()).isEqualTo(2);   // each decode gives its slot back
    }

    @Test
    void rejectsADecompressionBomb() {
        // A few-KB PNG can legally declare this and cost gigabytes to decode.
        assertThat(service.isWithinPixelBudget(new ImageProcessingService.Dimensions(50000, 50000))).isFalse();
    }

    @Test
    void rejectsNonsenseDimensions() {
        assertThat(service.isWithinPixelBudget(new ImageProcessingService.Dimensions(0, 100))).isFalse();
        assertThat(service.isWithinPixelBudget(new ImageProcessingService.Dimensions(-1, -1))).isFalse();
    }

    @Test
    void allowsFormatsItCannotParse() {
        // WebP has no stock reader; refusing everything unreadable would reject
        // valid uploads, so magic bytes and the size cap carry those.
        assertThat(service.isWithinPixelBudget(null)).isTrue();
    }

    // ── Decode verification ───────────────────────────────────────────────────

    @Test
    void acceptsAGenuineImage() throws IOException {
        assertThat(service.decodesCleanly(image(100, 80, "png"), "png")).isTrue();
        assertThat(service.decodesCleanly(image(100, 80, "jpg"), "jpg")).isTrue();
    }

    @Test
    void rejectsAPolyglot() {
        // Valid GIF magic bytes followed by something that is not a GIF. This
        // passes a header check and is exactly what the decode step is for.
        byte[] polyglot = new byte[256];
        System.arraycopy("GIF89a".getBytes(StandardCharsets.UTF_8), 0, polyglot, 0, 6);
        for (int i = 6; i < polyglot.length; i++) polyglot[i] = (byte) (i * 31);
        assertThat(service.decodesCleanly(polyglot, "gif")).isFalse();
    }

    @Test
    void rejectsATruncatedImage() throws IOException {
        byte[] full = image(400, 400, "png");
        byte[] half = new byte[full.length / 2];
        System.arraycopy(full, 0, half, 0, half.length);
        assertThat(service.decodesCleanly(half, "png")).isFalse();
    }

    @Test
    void doesNotRejectFormatsItCannotVerify() {
        assertThat(service.decodesCleanly("anything".getBytes(StandardCharsets.UTF_8), "webp")).isTrue();
    }

    // ── Variants ──────────────────────────────────────────────────────────────

    @Test
    void writesOneVariantPerWidthNarrowerThanTheSource() throws IOException {
        List<ImageProcessingService.Variant> variants =
                service.writeVariants(image(2400, 1600, "jpg"), uploadDir, "photo", "jpg");

        assertThat(variants).extracting(ImageProcessingService.Variant::width)
                .containsExactly(480, 960, 1600);
        for (ImageProcessingService.Variant v : variants) {
            assertThat(uploadDir.resolve(v.filename())).exists();
            assertThat(v.sizeBytes()).isPositive();
        }
    }

    @Test
    void variantsAreActuallyTheRequestedWidthAndKeepAspectRatio() throws IOException {
        service.writeVariants(image(2000, 1000, "png"), uploadDir, "wide", "png");

        BufferedImage small = ImageIO.read(uploadDir.resolve("wide-480w.png").toFile());
        assertThat(small.getWidth()).isEqualTo(480);
        assertThat(small.getHeight()).isEqualTo(240);   // 2:1 preserved
    }

    @Test
    void neverUpscales() throws IOException {
        List<ImageProcessingService.Variant> variants =
                service.writeVariants(image(300, 200, "png"), uploadDir, "small", "png");
        assertThat(variants).isEmpty();
        assertThat(Files.list(uploadDir)).isEmpty();
    }

    @Test
    void skipsWidthsAtOrAboveTheSourceWidth() throws IOException {
        List<ImageProcessingService.Variant> variants =
                service.writeVariants(image(1000, 800, "jpg"), uploadDir, "mid", "jpg");
        assertThat(variants).extracting(ImageProcessingService.Variant::width)
                .containsExactly(480, 960);
    }

    @Test
    void leavesGifsAlone() throws IOException {
        // Resizing an animated GIF would silently drop every frame but the first.
        assertThat(service.writeVariants(image(2000, 2000, "gif"), uploadDir, "anim", "gif")).isEmpty();
    }

    @Test
    void producesNoVariantsForAFormatItCannotRead() {
        assertThat(service.writeVariants("not an image".getBytes(StandardCharsets.UTF_8),
                uploadDir, "junk", "webp")).isEmpty();
    }

    @Test
    void survivesUndecodableBytesWithoutThrowing() {
        // A failure here must never fail the upload — the original is still fine.
        assertThatCode(() -> service.writeVariants(
                "still not an image".getBytes(StandardCharsets.UTF_8), uploadDir, "junk", "png"))
                .doesNotThrowAnyException();
    }

    @Test
    void generatesNothingWhenVariantsAreDisabled() throws IOException {
        ReflectionTestUtils.setField(service, "variantsEnabled", false);
        assertThat(service.writeVariants(image(2400, 1600, "jpg"), uploadDir, "off", "jpg")).isEmpty();
    }

    @Test
    void variantsAreSmallerThanTheOriginal() throws IOException {
        byte[] original = image(2400, 1600, "jpg");
        List<ImageProcessingService.Variant> variants =
                service.writeVariants(original, uploadDir, "photo", "jpg");
        // The whole point: a phone should not download the desktop-sized file.
        assertThat(variants.get(0).sizeBytes()).isLessThan(original.length);
    }
}
