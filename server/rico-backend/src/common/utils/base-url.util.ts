import { Request } from 'express';

/// The production origin the app and dashboards are served from. Used when
/// APP_BASE_URL isn't set so a deploy that predates the variable keeps
/// working without trusting the request.
const PRODUCTION_BASE_URL = 'https://app.rico-go.com';

/// The origin to put in links we email (password reset, vendor invite, new
/// order). Never taken from the request in production: the Host header is
/// client-controlled, so a forgot-password call with `Host: evil.example`
/// would otherwise mail the victim a real reset token pointing at the
/// attacker's server. Locally it still follows the request, so links work on
/// whatever port the dev server runs on.
export function publicBaseUrl(req: Request): string {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') return PRODUCTION_BASE_URL;
  return `${req.protocol}://${req.get('host')}`;
}
