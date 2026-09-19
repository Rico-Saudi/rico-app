// A tradesperson photographs their CV with a phone, or exports a two-page
// PDF — both land in the low megabytes. The cap is the backstop; the app
// checks the size before it starts the upload so the failure is immediate
// rather than after a minute on a mobile connection.
export const MAX_CV_BYTES = 5 * 1024 * 1024;

// PDF plus the image types a phone produces: "a CV" in practice is as often
// a photo of a printed page as it is a document.
export const ALLOWED_CV_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// Keyed by the document's own random token, not by the customer or by a
// sequential id: replacing a CV mints a new token, so the old URL stops
// resolving and the new bytes can never be served from a cache in place of
// the old ones — and nobody can enumerate their way to someone else's CV.
export function professionalCvUrl(token: string): string {
  return `/professionals/cv/${token}`;
}

/// What a CV token looks like. Checked before the lookup so a crawler with a
/// mangled URL is answered from memory rather than from the database.
export const CV_TOKEN_PATTERN = /^[a-f0-9]{32}$/;

// The card's colour scheme, chosen by the professional. Deliberately a short
// closed list rather than a free colour: every card stays inside the app's
// palette, so the chat thread doesn't turn into a scrapbook.
export const CARD_ACCENTS = ['green', 'gold', 'midnight', 'sand'] as const;
export type CardAccent = (typeof CARD_ACCENTS)[number];
export const DEFAULT_CARD_ACCENT: CardAccent = 'green';

export const MAX_BIO_LENGTH = 600;
export const MAX_SKILLS = 8;
export const MAX_SKILL_LENGTH = 24;
export const MAX_YEARS_EXPERIENCE = 60;
