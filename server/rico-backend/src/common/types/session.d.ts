import 'express-session';

declare module 'express-session' {
  interface SessionData {
    accountId?: string;
    app?: 'owner' | 'vendor';
    platformRole?: 'owner' | 'staff';
  }
}
