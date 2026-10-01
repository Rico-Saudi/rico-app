---
name: run-backend
description: Launch the rico-backend NestJS server and its owner/vendor dashboards locally, and drive them over HTTP. Use when asked to run, start, or verify the backend, the owner dashboard, the vendor dashboard, or any /owner, /vendor, /classify, /search or /deals endpoint against a real running server rather than the test suite.
---

# Running rico-backend locally

One process serves everything: the API, and the React dashboards out of
`client/dist` (`ServeStaticModule` + `SpaController`). There is no separate
frontend server to start — build the client, then start Nest.

## The four things that bite

1. **No `MONGODB_URI` in `.env`.** The repo ships an ephemeral in-memory
   Mongo (`scripts/start-dev-db.js`) that prints a URI and stays alive.
   Its data is gone when you stop it — fine for a demo, useless for
   anything you want to keep.
2. **Port 3000 is usually taken** by an unrelated Next.js app on this
   machine. Use `PORT=3100`. Check first: `lsof -nP -iTCP:3000 -sTCP:LISTEN`.
3. **`.env` has no LLM key** (`OPENWEATHER_API_KEY` only). So `/classify`
   and `/compose` return `server_misconfigured`, and anything downstream of
   them — chat intents, the knowledge-gap capture that feeds the owner
   dashboard's «تعليم ريكو» tab — produces nothing. Set `GROQ_API_KEY` in
   `.env` if the task needs them; otherwise seed the collections directly
   and say in your report that the data is seeded, not captured.
   `seed-learning-demo.mjs` next to this file does that for the learning
   tab: `node .claude/skills/run-backend/seed-learning-demo.mjs "$URI"`,
   run from `server/rico-backend`.
4. **No browser tooling installed** — no `chromium-cli`, no Playwright, no
   Chrome. You cannot screenshot a page. Drive the app with `curl` against
   the real routes and hand the user a URL to look at themselves.

## Launch

```bash
cd server/rico-backend
S=/tmp/rico-run; mkdir -p $S

# 1. Ephemeral Mongo. Prints "MONGODB_URI=mongodb://127.0.0.1:<port>/".
nohup node scripts/start-dev-db.js > $S/mongo.log 2>&1 &
until grep -q MONGODB_URI $S/mongo.log; do sleep 0.3; done
URI=$(grep -o 'mongodb://[^ ]*' $S/mongo.log)rico

# 2. Build. `npm run build` also reinstalls client deps — slow; do the two
#    halves directly unless dependencies actually changed.
npx nest build
(cd client && npx vite build)

# 3. Start.
MONGODB_URI=$URI PORT=3100 SESSION_SECRET=dev_secret \
  OWNER_EMAIL=owner@rico.test OWNER_PASSWORD=rico-dev-1234 \
  LEARNING_TRAIN_INTERVAL_HOURS=0 \
  nohup node dist/main.js > $S/server.log 2>&1 &
until curl -sf -o /dev/null http://localhost:3100/owner/login; do sleep 0.3; done
```

`LEARNING_TRAIN_INTERVAL_HOURS=0` stops the scheduled training run from
firing against an LLM key you may not have. Drop it once one is set.

On first boot the server seeds an owner account from `OWNER_EMAIL` /
`OWNER_PASSWORD`, and 106 professions. **It seeds the owner only when no
owner-app account exists**, so against a persistent database the env vars
are ignored and you must use the password already set.
Without the env vars the documented dev default is `owner@rico.app` /
`ChangeMe123!`.

## Drive it

Session-cookie auth, one `/auth/login` for both dashboards:

```bash
curl -s -c $S/c.txt -X POST http://localhost:3100/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@rico.test","password":"rico-dev-1234","app":"owner"}'

curl -s -b $S/c.txt http://localhost:3100/owner/learning/stats
```

Then hand the user **http://localhost:3100/owner/login** with the
credentials — the dashboard is React, and only their eyes can confirm it
renders.

Quoting: pass JSON bodies as `-d '{"k":"v"}'` in single quotes. Escaping
braces inside a shell function (`"\{\}"`) sends a literal backslash and the
server answers 400 `is not valid JSON` — a bug in your command, not the app.

Useful checks:
- routes actually mapped: `grep -o "Mapped {/owner/learning[^}]*}" $S/server.log`
- new UI reached the bundle: fetch the `/assets/index-*.js` the page
  references and `grep` for a string you added.

**A 200 on a page URL proves nothing.** `ServeStaticModule` answers every
unmatched GET with `index.html` — `/nonsense` and `/classify-bogus` both
return 200 and the SPA shell. (`src/spa/spa.controller.ts` carries a comment
claiming otherwise; the running behaviour is the fallback.) So to check a
page exists, read `SpaController` and the React router, or grep the bundle —
never a status code.

The fallback catches **GET only**, and that is the trap worth remembering:
a typo'd GET endpoint (`/owner/nope-api`) returns 200 and an HTML page, so a
`%{http_code}` check reads it as success. Always look at the body. Unmatched
POST/PATCH/DELETE do 404 properly, with JSON.

## Stop

```bash
pkill -f 'node dist/main.js'; pkill -f start-dev-db
```
