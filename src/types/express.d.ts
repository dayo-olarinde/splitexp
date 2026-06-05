import "better-auth";

declare global {
  namespace Express {
    interface Request {
      user?: import("better-auth").User;
      session?: import("better-auth").Session;
    }
  }
}
