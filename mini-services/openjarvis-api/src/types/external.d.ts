/**
 * Type declarations for modules without built-in types.
 * These are dynamically imported at runtime; we only need shape-level types.
 */

// ---- Express (v5 runtime, v4-compatible shape types) ----

declare namespace Express {
  interface Request {
    body: Record<string, any>;
    query: Record<string, any>;
    params: Record<string, string>;
    headers: Record<string, string | string[] | undefined>;
    method: string;
    originalUrl: string;
    path: string;
    requestId?: string;
    socket: any;
    on(event: string, callback: (...args: any[]) => void): any;
  }
  interface Response {
    statusCode: number;
    writableEnded: boolean;
    destroyed: boolean;
    headersSent: boolean;
    status(code: number): this;
    json(body: any): this;
    send(body?: any): this;
    set(name: string, value: string): this;
    setHeader(name: string, value: string | string[]): this;
    write(chunk: any, encoding?: string, callback?: (err?: any) => void): boolean;
    end(chunk?: any, encoding?: string, callback?: (err?: any) => void): this;
    flushHeaders(): void;
    on(event: string, callback: (...args: any[]) => void): any;
    once(event: string, callback: (...args: any[]) => void): any;
  }
  interface NextFunction {
    (err?: any): void;
  }
  interface ErrorRequestHandler {
    (err: any, req: Request, res: Response, next: NextFunction): any;
  }
  interface RequestHandler {
    (req: Request, res: Response, next: NextFunction): any;
  }
  interface IRouter extends RequestHandler {
    use(path: string | RequestHandler | ErrorRequestHandler, ...handlers: (RequestHandler | ErrorRequestHandler)[]): this;
    get(path: string, ...handlers: RequestHandler[]): this;
    post(path: string, ...handlers: RequestHandler[]): this;
    put(path: string, ...handlers: RequestHandler[]): this;
    delete(path: string, ...handlers: RequestHandler[]): this;
    patch(path: string, ...handlers: RequestHandler[]): this;
  }
  interface IExpress extends IRouter {
    listen(port: number, host: string, callback?: () => void): any;
    listen(port: number, callback?: () => void): any;
    json(options?: Record<string, any>): RequestHandler;
    raw(options?: Record<string, any>): RequestHandler;
    text(options?: Record<string, any>): RequestHandler;
    urlencoded(options?: Record<string, any>): RequestHandler;
    static(root: string, options?: Record<string, any>): RequestHandler;
  }
}

declare module 'express' {
  const e: {
    (): Express.IExpress;
    json(options?: Record<string, any>): Express.RequestHandler;
    raw(options?: Record<string, any>): Express.RequestHandler;
    text(options?: Record<string, any>): Express.RequestHandler;
    urlencoded(options?: Record<string, any>): Express.RequestHandler;
    static(root: string, options?: Record<string, any>): Express.RequestHandler;
  };
  export default e;
  type Request = Express.Request;
  type Response = Express.Response;
  type NextFunction = Express.NextFunction;
  type RequestHandler = Express.RequestHandler;
  type ErrorRequestHandler = Express.ErrorRequestHandler;
  type Router = Express.IRouter;
  function Router(): Express.IRouter;
  export { Request, Response, NextFunction, RequestHandler, Router, ErrorRequestHandler };
}

// ---- Multer ----

declare module 'multer' {
  import { RequestHandler } from 'express';
  interface Multer {
    single(fieldName: string): RequestHandler;
    array(fieldName: string, maxCount?: number): RequestHandler;
    fields(fields: Array<{ name: string; maxCount?: number }>): RequestHandler;
    none(): RequestHandler;
  }
  function multer(options?: Record<string, any>): Multer;
  namespace multer {
    function memoryStorage(): any;
  }
  export default multer;
}

// ---- @nut-tree/nut-js ----

declare module '@nut-tree/nut-js' {
  export class Point {
    constructor(x: number, y: number);
    x: number;
    y: number;
  }

  export class Region {
    constructor(x: number, y: number, width: number, height: number);
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export enum Button {
    Left = 0,
    Middle = 1,
    Right = 2,
  }

  export enum Key {
    A = 0x41, B = 0x42, C = 0x43, D = 0x44, E = 0x45, F = 0x46, G = 0x47,
    H = 0x48, I = 0x49, J = 0x4A, K = 0x4B, L = 0x4C, M = 0x4D,
    N = 0x4E, O = 0x4F, P = 0x50, Q = 0x51, R = 0x52, S = 0x53,
    T = 0x54, U = 0x55, V = 0x56, W = 0x57, X = 0x58, Y = 0x59, Z = 0x5A,
    Num0 = 0x30, Num1 = 0x31, Num2 = 0x32, Num3 = 0x33, Num4 = 0x34,
    Num5 = 0x35, Num6 = 0x36, Num7 = 0x37, Num8 = 0x38, Num9 = 0x39,
    F1 = 0x70, F2 = 0x71, F3 = 0x72, F4 = 0x73, F5 = 0x74, F6 = 0x75,
    F7 = 0x76, F8 = 0x77, F9 = 0x78, F10 = 0x79, F11 = 0x7A, F12 = 0x7B,
    Enter = 0x0D, Escape = 0x1B, Space = 0x20, Tab = 0x09,
    Shift = 0x10, Control = 0x11, Alt = 0x12,
    LeftShift = 0x10, LeftControl = 0x11, LeftAlt = 0x12,
    RightShift = 0x101, RightControl = 0x103, RightAlt = 0x105,
    Backspace = 0x08, Delete = 0x2E, Home = 0x24, End = 0x23,
    PageUp = 0x21, PageDown = 0x22, Insert = 0x2D,
    Up = 0x26, Down = 0x28, Left = 0x25, Right = 0x27,
    CapsLock = 0x14, PrintScreen = 0x2C, ScrollLock = 0x91,
    Pause = 0x13, NumLock = 0x90,
    Minus = 0xBD, Equals = 0xBB, Backslash = 0xDC,
    Semicolon = 0xBA, Quote = 0xDE, Comma = 0xBC, Period = 0xBE,
    Slash = 0xBF, LeftBracket = 0xDB, RightBracket = 0xDD,
    BackQuote = 0xC0,
  }

  // Image result from screen.capture()
  export interface JimpImage {
    width: number;
    height: number;
    getBase64Async(mimeType: string): Promise<string>;
    toPNG(): Buffer;
    getData(): Buffer;
  }

  // Window handle
  export interface WindowHandle {
    title: string;
    processId: number;
    bounds?: { x: number; y: number; width: number; height: number };
    region?: { x: number; y: number; width: number; height: number };
    owner?: { name: string };
  }

  // Mouse API
  export const mouse: {
    move(point: Point): Promise<void>;
    click(button?: Button): Promise<void>;
    doubleClick(button?: Button): Promise<void>;
    rightClick(): Promise<void>;
    scrollDown(amount: number): Promise<void>;
    scrollUp(amount: number): Promise<void>;
    scrollLeft(amount: number): Promise<void>;
    scrollRight(amount: number): Promise<void>;
    getPosition(): Promise<Point>;
  };

  // Keyboard API
  export const keyboard: {
    type(text: string, delay?: number): Promise<void>;
    pressKey(...keys: Key[]): Promise<void>;
    releaseKey(...keys: Key[]): Promise<void>;
  };

  // Screen API
  export const screen: {
    width(): Promise<number>;
    height(): Promise<number>;
    capture(region?: Region): Promise<JimpImage>;
  };

  // Clipboard API
  export const clipboard: {
    paste(): Promise<string>;
    copy(text: string): Promise<void>;
  };

  // Window API
  export const window: {
    getActiveWindow(): Promise<WindowHandle | null>;
    filterWindows(filter: (w: WindowHandle) => boolean): Promise<WindowHandle[]>;
    focusWindow(windowHandle: WindowHandle): Promise<void>;
  };
}

// ---- pdf-parse ----

declare module 'pdf-parse' {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: Record<string, any>;
    metadata: Record<string, any>;
    text: string;
    version: string;
  }
  function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>,
  ): Promise<PDFData>;
  export default pdfParse;
}

// ---- socket.io ----

declare module 'socket.io' {
  import { Server as HttpServer } from 'node:http';

  interface Socket {
    id: string;
    data: Record<string, any>;
    join(room: string): void;
    leave(room: string): void;
    on(event: string, callback: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): this;
  }

  class Server {
    constructor(httpServer?: HttpServer, options?: Record<string, any>);
    on(event: string, callback: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): this;
    to(room: string): Server;
    listen(port: number): this;
    attach(httpServer: HttpServer, options?: Record<string, any>): this;
  }

  export { Server, Socket };
}

// ---- jszip ----

declare module 'jszip' {
  class JSZip {
    constructor();
    async: {
      loadAsync(data: Buffer | string, options?: Record<string, unknown>): Promise<JSZip>;
    };
    file(name: string, data?: string | Buffer | NodeJS.ReadableStream, options?: Record<string, unknown>): this;
    folder(name: string): JSZip;
    generateAsync(options?: Record<string, unknown>): Promise<Buffer>;
    static loadAsync(data: Buffer | string, options?: Record<string, unknown>): Promise<JSZip>;
    loadAsync(data: Buffer | string, options?: Record<string, unknown>): Promise<JSZip>;
  }
  export default JSZip;
}

// ---- bun:test ----

declare module 'bun:test' {
  function describe(name: string, fn: () => void | Promise<void>): void;
  function it(name: string, fn: () => void | Promise<void>): void;
  function test(name: string, fn: () => void | Promise<void>): void;
  function expect(value: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toThrow(expected?: string | RegExp): void;
    toContain(expected: unknown): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toHaveLength(expected: number): void;
    not: {
      toBe(expected: unknown): void;
      toEqual(expected: unknown): void;
      toBeTruthy(): void;
      toBeFalsy(): void;
      toBeNull(): void;
      toContain(expected: unknown): void;
    };
  };
  function beforeAll(fn: () => void | Promise<void>): void;
  function afterAll(fn: () => void | Promise<void>): void;
  function beforeEach(fn: () => void | Promise<void>): void;
  function afterEach(fn: () => void | Promise<void>): void;
  function spyOn(object: any, method: string): void;
}

// ---- .prisma/client ----

declare module '../../node_modules/.prisma/client/index.js' {
  export * from '@prisma/client';
}

declare module '.prisma/client/index.js' {
  export * from '@prisma/client';
}