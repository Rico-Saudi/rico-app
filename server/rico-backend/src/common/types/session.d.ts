import 'express-session';

declare module 'express-session' {
  interface SessionData {
    accountId?: string;
    app?: 'owner' | 'vendor';
    platformRole?: 'owner' | 'staff';
    /** Epoch ms of the login that created this session — compared against
     *  Account.passwordChangedAt by SessionGuard. */
    issuedAt?: number;
  }
}
