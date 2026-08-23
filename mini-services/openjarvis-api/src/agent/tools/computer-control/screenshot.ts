/**
 * Screenshot tool — captures the screen via nut.js.
 * Returns base64-encoded PNG image data.
 * Gracefully degrades on headless servers.
 */
import { ToolHandler, ToolExecutionResult } from '../../types.js';
import { getPermissionManager } from '../../permissions/permissionManager.js';
import { requireDisplay, encodeRawRgbaToPng } from './platform.js';

export function createScreenshotTool(): ToolHandler {
  return {
    name: 'screenshot',
    description:
      'Capture a screenshot of the current screen. Returns base64-encoded image data.',
    inputSchema: {
      type: 'object',
      properties: {
        monitor: { type: 'number', description: 'Monitor index (default: 0)' },
        format: {
          type: 'string',
          enum: ['png', 'jpeg'],
          description: 'Image format (default: png)',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        imageBase64: { type: 'string', description: 'Base64-encoded image data' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
    },
    riskLevel: 'low',
    async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const perms = getPermissionManager();
      const check = perms.check('screenshot');
      if (!check.allowed) {
        return { success: false, output: null, error: check.reason, durationMs: 0 };
      }

      const start = Date.now();
      try {
        await requireDisplay();
        const { screen, Region } = await import('@nut-tree/nut-js');

        // Determine capture region (full primary screen)
        const width  = await screen.width();
        const height = await screen.height();

        let image: any;
        if (Region) {
          image = await screen.capture(new Region(0, 0, width, height));
        } else {
          image = await screen.capture();
        }

        // Convert to base64 PNG
        const base64 = await imageToBase64Png(image, width, height);

        return {
          success: true,
          output: {
            success: true,
            imageBase64: base64,
            width,
            height,
          },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          success: false,
          output: { available: false, reason: err.message },
          error: err.message,
          durationMs: Date.now() - start,
        };
      }
    },
  };
}

// ------------------------------------------------------------------
// Image → base64 PNG conversion
// ------------------------------------------------------------------

/**
 * Tries multiple strategies to extract PNG bytes from a nut.js Image:
 *  1. Jimp-style getBase64Async('image/png')
 *  2. Canvas-style getImageData()  →  raw RGBA  →  our PNG encoder
 *  3. Jimp-style getData()  →  raw RGBA  →  our PNG encoder
 */
async function imageToBase64Png(
  image: any,
  width: number,
  height: number,
): Promise<string> {
  // Strategy 1: Jimp getBase64Async
  if (typeof image.getBase64Async === 'function') {
    const dataUrl: string = await image.getBase64Async('image/png');
    // Strip the "data:image/png;base64," prefix
    const commaIdx = dataUrl.indexOf(',');
    return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  }

  // Strategy 2: Canvas-style getImageData
  if (typeof image.getImageData === 'function') {
    const imgData = image.getImageData();
    const rgba = imgData.data instanceof Uint8Array
      ? imgData.data
      : new Uint8Array(imgData.data);
    const pngBuf = encodeRawRgbaToPng(rgba, imgData.width ?? width, imgData.height ?? height);
    return pngBuf.toString('base64');
  }

  // Strategy 3: Jimp getData() / toPNG()
  if (typeof image.toPNG === 'function') {
    const pngBuf: Buffer = image.toPNG();
    return pngBuf.toString('base64');
  }

  if (typeof image.getData === 'function') {
    const raw: Buffer = image.getData();
    // Jimp getData returns raw pixel buffer (RGBA)
    const pngBuf = encodeRawRgbaToPng(new Uint8Array(raw), width, height);
    return pngBuf.toString('base64');
  }

  throw new Error(
    'Could not extract image data from nut.js capture result. ' +
    'The returned image object does not expose getBase64Async, getImageData, toPNG, or getData.',
  );
}
