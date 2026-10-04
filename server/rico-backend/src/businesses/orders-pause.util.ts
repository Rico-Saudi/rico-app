export interface OrdersPause {
  // Null = paused until the vendor reopens by hand.
  until: Date | null;
  note: string | null;
}

// The one reading of a business's pause fields. A pause whose end time has
// passed is simply over — nothing has to run to clear the flag.
export function ordersPauseState(
  business: { ordersPaused?: boolean | null; ordersPausedUntil?: Date | null; ordersPausedNote?: string | null },
  now: Date = new Date(),
): OrdersPause | null {
  if (!business.ordersPaused) return null;
  if (business.ordersPausedUntil && business.ordersPausedUntil <= now) return null;
  return { until: business.ordersPausedUntil ?? null, note: business.ordersPausedNote ?? null };
}
