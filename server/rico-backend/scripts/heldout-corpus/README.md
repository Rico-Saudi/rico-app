# Held-out corpus

Messages written blind — without reading `keyword-tables.ts` or the agent
corpus — to measure how the keyword fallback (and, via `eval-classify`, the
model) handles phrasing it was never tuned on.

**Do not tune on these.** Fixing the tables until this file passes turns it
into a second training set and the number stops meaning anything. When a
miss here points at a real gap, write *new* agent-corpus lines for it, fix
against those, and only then re-read this score.

    npx ts-node -T scripts/eval-fallback.ts --dir=scripts/heldout-corpus

The spec (`heldout-corpus.spec.ts`) only guards against a drop below the
score recorded when the file was written.
