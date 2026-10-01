import { USER_AGENT } from './scraping.constants';

/// A deliberately small robots.txt reader.
///
/// It handles the parts sites actually use to say no — User-agent groups,
/// Disallow, Allow, and longest-match precedence — and nothing else. It is not
/// a complete implementation of the spec, and where it is unsure it refuses.
///
/// Refusing on doubt is the whole point: the cost of skipping a page we were
/// allowed to read is one missed offer, and the cost of reading one we were
/// told not to is the thing this file exists to prevent.

interface Rule {
  path: string;
  allow: boolean;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { rules: Rule[] | null; expiresAt: number }>();

/// Parses the groups that apply to us: our own name first, falling back to the
/// wildcard group. A site naming RicoBot explicitly means it, so that group
/// wins outright rather than merging with `*`.
export function parseRobots(body: string, userAgent: string): Rule[] {
  const lines = body.split('\n').map((l) => l.replace(/#.*$/, '').trim());

  const groups = new Map<string, Rule[]>();
  let currentAgents: string[] = [];
  let expectingAgents = false;

  for (const line of lines) {
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      // Consecutive User-agent lines share one group of rules.
      if (!expectingAgents) currentAgents = [];
      currentAgents.push(value.toLowerCase());
      expectingAgents = true;
      continue;
    }

    expectingAgents = false;
    if (field !== 'disallow' && field !== 'allow') continue;

    for (const agent of currentAgents) {
      if (!groups.has(agent)) groups.set(agent, []);
      // An empty Disallow means "nothing is disallowed" — not a rule.
      if (field === 'disallow' && value === '') continue;
      groups.get(agent)!.push({ path: value, allow: field === 'allow' });
    }
  }

  const ourName = userAgent.split('/')[0].toLowerCase();
  return groups.get(ourName) ?? groups.get('*') ?? [];
}

/// Longest matching rule wins, and Allow beats Disallow at equal length —
/// which is how a site carves an exception out of a broad block.
export function isPathAllowed(rules: Rule[], path: string): boolean {
  let best: Rule | null = null;

  for (const rule of rules) {
    // Only the `*` wildcard is supported. A rule using anything fancier is
    // treated as matching, so we err toward not fetching.
    const pattern = rule.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    if (!new RegExp(`^${pattern}`).test(path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) {
      best = rule;
    }
  }

  return best ? best.allow : true;
}

/// Whether this URL may be fetched.
///
/// Returns false if robots.txt cannot be read at all. That is stricter than
/// the convention — a missing robots.txt usually means "allowed" — because a
/// site that is refusing to serve us its rules is not a site we should be
/// guessing about.
export async function isAllowed(url: string): Promise<boolean> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }

  const origin = target.origin;
  const cached = cache.get(origin);
  const rules =
    cached && cached.expiresAt > Date.now() ? cached.rules : await fetchRules(origin);

  if (!cached || cached.expiresAt <= Date.now()) {
    cache.set(origin, { rules, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  if (rules === null) return false;
  return isPathAllowed(rules, target.pathname + target.search);
}

async function fetchRules(origin: string): Promise<Rule[] | null> {
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });

    // 404 genuinely means "no rules stated", which is permission.
    if (response.status === 404) return [];
    if (!response.ok) return null;

    return parseRobots(await response.text(), USER_AGENT);
  } catch {
    return null;
  }
}
