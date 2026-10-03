package com.springbootprojects.webpostingserver.posts.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Set;

/**
 * Validates uploaded images and derives smaller versions of them.
 *
 * Two jobs, both security-relevant:
 *
 *  1. **Verification.** Magic bytes only prove the first few bytes look like an
 *     image. Actually decoding the file proves the whole thing is one, which
 *     rejects truncated files and polyglots — a file that is a valid GIF header
 *     followed by something else entirely. Dimensions are read from the header
 *     first so a decompression bomb (a small file that expands to gigapixels)
 *     is refused before any pixels are allocated.
 *
 *  2. **Responsive variants.** One 4000px photo sent to a phone on a slow
 *     connection wastes most of what it downloads. Generating a few widths at
 *     upload time lets the browser pick via srcset.
 *
 * Formats ImageIO cannot decode (WebP, on a stock JDK) are stored as-is and
 * simply have no variants. The upload still succeeds; it just is not resized.
 */
@Service
public class ImageProcessingService {

    private static final Logger log = LoggerFactory.getLogger(ImageProcessingService.class);

    /**
     * Widths generated for each upload. Chosen against common layout widths:
     * 480 covers a phone, 960 a tablet or a 1x desktop column, 1600 a retina
     * desktop column. A variant is skipped when the source is already narrower,
     * so upscaling never happens.
     */
    public static final int[] VARIANT_WIDTHS = { 480, 960, 1600 };

    /**
     * Largest image accepted, in total pixels (16 megapixels, about 64 MB
     * decoded). Guards against decompression bombs: a few-KB PNG can declare
     * 50000x50000 and cost 10 GB of heap to decode. It was 40 megapixels, so a
     * few parallel uploads could use up the heap.
     */
    static final long MAX_PIXELS = 16_000_000L;

    /** Thrown when every decode slot stayed taken for the whole wait: the caller answers 503. */
    @org.springframework.web.bind.annotation.ResponseStatus(
            value = org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, reason = "Busy, try again in a moment")
    public static class BusyException extends RuntimeException {
        public BusyException() { super("Busy, try again in a moment"); }
    }

    /**
     * At most two images are decoded or resized at once, whoever asks. Each
     * decode can take tens of megabytes; unbounded parallel uploads exhausted
     * the heap. Others wait a moment, then are refused with BusyException.
     */
    final java.util.concurrent.Semaphore decodeSlots = new java.util.concurrent.Semaphore(2);
    long decodeWaitMillis = 5_000;

    private void acquireSlot() {
        try {
            if (!decodeSlots.tryAcquire(decodeWaitMillis, java.util.concurrent.TimeUnit.MILLISECONDS))
                throw new BusyException();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusyException();
        }
    }

    /** Formats ImageIO can reliably decode and re-encode on a stock JDK. */
    private static final Set<String> RESIZABLE = Set.of("jpg", "jpeg", "png", "gif");

    @Value("${app.image-variants-enabled:true}")
    private boolean variantsEnabled;

    /** Dimensions of an image, as declared by its header. */
    public record Dimensions(int width, int height) {}

    /** One stored rendition of an upload. */
    public record Variant(String filename, int width, long sizeBytes) {}

    /**
     * Reads width and height from the header without decoding pixel data, so an
     * oversized image costs nothing to reject.
     *
     * @return the dimensions, or null if no reader can parse the file
     */
    public Dimensions readDimensions(byte[] data) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
            if (in == null) return null;
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) return null;
            ImageReader reader = readers.next();
            try {
                reader.setInput(in);
                return new Dimensions(reader.getWidth(0), reader.getHeight(0));
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            // A malformed header throws from inside the reader; treat as unreadable.
            return null;
        }
    }

    /**
     * True when the declared dimensions are within the pixel budget. An
     * unreadable header returns true — WebP has no stock reader, and refusing
     * every format ImageIO cannot parse would reject valid uploads. Magic-byte
     * and size checks still apply to those.
     */
    public boolean isWithinPixelBudget(Dimensions dims) {
        if (dims == null) return true;
        if (dims.width() <= 0 || dims.height() <= 0) return false;
        return (long) dims.width() * dims.height() <= MAX_PIXELS;
    }

    /**
     * Removes the EXIF (APP1 "Exif") segments from a JPEG, which is where GPS
     * position and camera serial numbers live. Only segment headers are walked;
     * entropy-coded image data is copied untouched, so the picture is
     * bit-identical. Anything malformed, or any other format (PNG, WebP, GIF
     * are left as is), is returned unchanged.
     */
    public byte[] stripJpegMetadata(byte[] data, String extension) {
        if (!"jpg".equals(extension) && !"jpeg".equals(extension)) return data;
        if (data.length < 4 || (data[0] & 0xFF) != 0xFF || (data[1] & 0xFF) != 0xD8) return data;

        ByteArrayOutputStream out = new ByteArrayOutputStream(data.length);
        out.write(0xFF); out.write(0xD8);
        int pos = 2;
        boolean stripped = false;
        while (pos + 4 <= data.length) {
            if ((data[pos] & 0xFF) != 0xFF) return data;          // not at a marker: bail out
            int marker = data[pos + 1] & 0xFF;
            if (marker == 0xFF) { out.write(0xFF); pos++; continue; }   // fill byte
            // Start of scan, end of image, or a marker without a length: the rest is image data.
            if (marker == 0xDA || marker == 0xD9) break;
            if (marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
                out.write(0xFF); out.write(marker); pos += 2; continue;
            }
            int len = ((data[pos + 2] & 0xFF) << 8) | (data[pos + 3] & 0xFF);
            if (len < 2 || pos + 2 + len > data.length) return data;   // corrupt: leave alone
            boolean exif = marker == 0xE1 && len >= 8
                    && data[pos + 4] == 'E' && data[pos + 5] == 'x'
                    && data[pos + 6] == 'i' && data[pos + 7] == 'f';
            if (exif) stripped = true;
            else out.write(data, pos, 2 + len);
            pos += 2 + len;
        }
        if (!stripped) return data;
        out.write(data, pos, data.length - pos);
        return out.toByteArray();
    }

    /**
     * Fully decodes the image to prove it is what it claims to be.
     *
     * @return true if the bytes decode, or if no reader exists for the format
     *         (see isWithinPixelBudget for why that is not a rejection)
     */
    public boolean decodesCleanly(byte[] data, String extension) {
        if (!RESIZABLE.contains(extension)) return true;   // no reader; cannot verify
        acquireSlot();
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(data));
            return img != null && img.getWidth() > 0 && img.getHeight() > 0;
        } catch (IOException | RuntimeException e) {
            log.debug("Upload failed to decode as {}: {}", extension, e.toString());
            return false;
        } finally {
            decodeSlots.release();
        }
    }

    /** An image re-encoded for a profile picture. */
    public record Compressed(byte[] bytes, String extension) {}

    /**
     * Shrinks an image into a square profile picture: cropped to its middle
     * square, scaled down to at most {@code maxSide} pixels, and saved as JPEG
     * (PNG when it has transparency). The upload's own size no longer matters,
     * only what comes out. An animated GIF becomes its first frame.
     *
     * @return the result, or null if the image cannot be decoded here (WebP)
     */
    public Compressed compressSquare(byte[] data, int maxSide) {
        acquireSlot();
        try {
            BufferedImage src = ImageIO.read(new ByteArrayInputStream(data));
            if (src == null || src.getWidth() <= 0 || src.getHeight() <= 0) return null;
            int side = Math.min(src.getWidth(), src.getHeight());
            BufferedImage square = src.getSubimage((src.getWidth() - side) / 2, (src.getHeight() - side) / 2, side, side);
            int target = Math.min(side, maxSide);
            boolean alpha = src.getColorModel().hasAlpha();
            // Halve repeatedly rather than in one jump: a single big reduction aliases.
            BufferedImage out = square;
            int w = side;
            while (w > target) {
                int next = Math.max(target, w / 2);
                BufferedImage scaled = new BufferedImage(next, next, alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
                java.awt.Graphics2D g = scaled.createGraphics();
                g.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION, java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                g.setRenderingHint(java.awt.RenderingHints.KEY_RENDERING, java.awt.RenderingHints.VALUE_RENDER_QUALITY);
                g.drawImage(out, 0, 0, next, next, null);
                g.dispose();
                out = scaled;
                w = next;
            }
            if (out == square && !alpha && square.getType() != BufferedImage.TYPE_INT_RGB) {
                BufferedImage rgb = new BufferedImage(side, side, BufferedImage.TYPE_INT_RGB);
                java.awt.Graphics2D g = rgb.createGraphics();
                g.drawImage(square, 0, 0, null);
                g.dispose();
                out = rgb;
            }
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            if (alpha) {
                ImageIO.write(out, "png", bytes);
                return new Compressed(bytes.toByteArray(), ".png");
            }
            javax.imageio.ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
            javax.imageio.ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(javax.imageio.ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(0.88f);
            try (javax.imageio.stream.ImageOutputStream ios = ImageIO.createImageOutputStream(bytes)) {
                writer.setOutput(ios);
                writer.write(null, new javax.imageio.IIOImage(out, null, null), param);
            } finally {
                writer.dispose();
            }
            return new Compressed(bytes.toByteArray(), ".jpg");
        } catch (IOException | RuntimeException e) {
            log.debug("Could not compress image: {}", e.toString());
            return null;
        } finally {
            decodeSlots.release();
        }
    }

    /**
     * Writes downscaled copies of {@code data} next to the original, named
     * {@code <base>-<width>w.<ext>}.
     *
     * Never throws: a failure to derive variants leaves the original usable, so
     * it is logged and skipped rather than failing the upload.
     *
     * @return the variants actually written, smallest first; empty if none were
     */
    public List<Variant> writeVariants(byte[] data, Path uploadPath, String baseName, String extension) {
        List<Variant> written = new ArrayList<>();
        if (!variantsEnabled || !RESIZABLE.contains(extension)) return written;

        // GIFs may be animated; resizing would silently drop every frame but the
        // first, so they are stored as-is.
        if (extension.equals("gif")) return written;

        acquireSlot();
        try {
            return writeVariantsHeld(data, uploadPath, baseName, extension, written);
        } finally {
            decodeSlots.release();
        }
    }

    private List<Variant> writeVariantsHeld(byte[] data, Path uploadPath, String baseName, String extension,
                                            List<Variant> written) {
        BufferedImage source;
        try {
            source = ImageIO.read(new ByteArrayInputStream(data));
        } catch (IOException | RuntimeException e) {
            log.warn("Could not read upload for variant generation: {}", e.toString());
            return written;
        }
        if (source == null) return written;

        for (int width : VARIANT_WIDTHS) {
            if (width >= source.getWidth()) continue;    // never upscale
            try {
                BufferedImage scaled = scaleToWidth(source, width, extension);
                String filename = baseName + "-" + width + "w." + extension;
                Path target = uploadPath.resolve(filename);
                if (!ImageIO.write(scaled, extension.equals("jpg") ? "jpeg" : extension, target.toFile())) {
                    log.warn("No ImageIO writer for {}; skipping {}px variant", extension, width);
                    continue;
                }
                written.add(new Variant(filename, width, Files.size(target)));
            } catch (IOException | RuntimeException e) {
                log.warn("Failed to write {}px variant: {}", width, e.toString());
            }
        }
        return written;
    }

    /**
     * Scales preserving aspect ratio, with bilinear filtering and high-quality
     * rendering hints — nearest-neighbour downscaling of a photo looks visibly
     * gritty.
     *
     * PNGs keep an alpha channel; JPEG has none, so a transparent source is
     * composited onto white rather than turning black.
     */
    private BufferedImage scaleToWidth(BufferedImage source, int targetWidth, String extension) {
        int targetHeight = Math.max(1,
                Math.round(source.getHeight() * (targetWidth / (float) source.getWidth())));

        boolean keepAlpha = extension.equals("png");
        BufferedImage out = new BufferedImage(targetWidth, targetHeight,
                keepAlpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);

        Graphics2D g = out.createGraphics();
        try {
            if (!keepAlpha) {
                g.setColor(java.awt.Color.WHITE);
                g.fillRect(0, 0, targetWidth, targetHeight);
            }
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.drawImage(source, 0, 0, targetWidth, targetHeight, null);
        } finally {
            g.dispose();
        }
        return out;
    }
}
