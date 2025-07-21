import * as express from 'express';

// Extend Express types to allow Promise<Response> return type in RequestHandler
declare global {
  namespace Express {
    interface Response {
      // This is a hack to make TypeScript accept returning Response from RequestHandler
      // without having to use 'as unknown as RequestHandler' everywhere
    }
    interface Request {
      dbUserId?: string | null;
    }
  }
}

// Override the RequestHandler type to allow returning a Response
declare module 'express' {
  interface RequestHandler {
    (req: express.Request, res: express.Response, next: express.NextFunction): void | Promise<void> | express.Response | Promise<express.Response>;
  }
}

export { }; 