/**
 * Augments Express' `Request.user` so that, after a successful JWT guard pass,
 * `req.user` is strongly typed as the authenticated principal.
 *
 * The `@CurrentUser()` decorator reads from this same shape.
 */

import 'express';

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
    }
  }
}

export {};
