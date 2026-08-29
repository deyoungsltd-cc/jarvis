/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Express type augmentations — adds custom properties WITHOUT replacing
 * the built-in Express types. The previous version accidentally overrode
 * the entire 'express' module, stripping all built-in Request/Response methods.
 */
declare namespace Express {
  interface Request {
    requestId?: string;
    file?: any;
  }
}

/** multer default export — no types needed, we use it as `any` */
declare module 'multer' {
  const multer: any;
  export default multer;
}

/** pdf-parse has no bundled types */
declare module 'pdf-parse' {
  function pdfParse(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<{
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }>;
  export default pdfParse;
}

/** jszip — only used if a route imports it */
declare module 'jszip' {
  import { EventEmitter } from 'events';
  class JSZip extends EventEmitter {
    file(name: string, data?: string | Buffer | NodeJS.ReadableStream, options?: Record<string, unknown>): JSZip;
    folder(name: string): JSZip;
    generateAsync(options?: Record<string, unknown>): Promise<Buffer>;
    loadAsync(data: Buffer | string, options?: Record<string, unknown>): Promise<JSZip>;
  }
  export default JSZip;
}
