import { SetMetadata } from '@nestjs/common';

export const REQUIRE_APP_KEY = 'requireApp';

// Marks a route/controller as restricted to one dashboard's sessions —
// SessionGuard reads this via Reflector and 403s a cross-app session
// (e.g. a vendor session hitting an owner-only route).
export const RequireApp = (app: 'owner' | 'vendor') => SetMetadata(REQUIRE_APP_KEY, app);
