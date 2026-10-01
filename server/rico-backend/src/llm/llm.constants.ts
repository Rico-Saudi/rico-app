/// Which LLM the chat's two thinking endpoints talk to.
///
/// Groq and OpenRouter both speak the OpenAI chat-completions format, so this
/// is a base URL, a key, and a model list — not two client implementations.
///
/// The default is Groq with exactly the settings it had before this module
/// existed, so deploying this changes nothing until LLM_PROVIDER is set. A
/// provider swap is a config change, not a release.

/// 'training' is the nightly pass over the questions Rico failed to answer
/// (see learning/training.service). It reasons about the same taxonomy the
/// classifier does, so it rides the classifier's model chain rather than
/// naming its own — one fewer env var to keep in step.
///
/// 'simulate' is scripts/simulate-users.ts: the persona agents that play
/// customers, and the judge that grades Rico's answers to them. Never on a
/// customer's path, so it rides the same chain rather than earning its own.
export type LlmPurpose = 'classify' | 'compose' | 'training' | 'simulate';

export type ProviderName = 'groq' | 'openrouter';

export interface ProviderConfig {
  name: ProviderName;
  url: string;
  apiKey: string | undefined;
  /// Models in priority order. OpenRouter fails over between them within a
  /// single request; on Groq the gateway itself retries the next one when
  /// the first answers 429 (see LlmService.complete).
  models: string[];
  /// Extra headers the provider wants. OpenRouter uses these to attribute
  /// traffic in its dashboard; Groq needs none.
  headers: Record<string, string>;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/// Groq meters tokens per minute *per model*, and the classifier's system
/// prompt alone is most of the free tier's cap on one model — so a second
/// message inside the same minute was a 429, and the client fell back to
/// keyword matching. The 20b sibling has its own bucket, so it answers the
/// messages the 120b is too busy for; a worse model beats no model.
const DEFAULT_GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

/// Splits "a/b, c/d" into ['a/b', 'c/d']. Empty entries are dropped so a
/// trailing comma in an env var can't produce a request for a model named ''.
function parseModelList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

/// Resolves the provider for one endpoint. `purpose` matters because the two
/// endpoints want different things: classification wants the best reasoning we
/// can afford (a bad intent sends the user to the wrong place), while
/// composition wants speed (its 5s client timeout falls back to a fixed
/// template, so a slow model quietly costs reply quality rather than erroring).
/// That's why each can name its own chain.
export function providerFor(purpose: LlmPurpose): ProviderConfig {
  const provider = (process.env.LLM_PROVIDER || 'groq') as ProviderName;

  if (provider === 'openrouter') {
    const perPurpose =
      purpose === 'compose'
        ? parseModelList(process.env.OPENROUTER_COMPOSE_MODELS)
        : parseModelList(process.env.OPENROUTER_CLASSIFY_MODELS);
    const models = perPurpose.length > 0 ? perPurpose : parseModelList(process.env.OPENROUTER_MODEL);

    return {
      name: 'openrouter',
      url: OPENROUTER_URL,
      apiKey: process.env.OPENROUTER_API_KEY,
      models,
      headers: {
        // Both optional, both only for OpenRouter's own attribution pages.
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://app.rico-go.com',
        'X-Title': 'Rico',
      },
    };
  }

  return {
    name: 'groq',
    url: GROQ_URL,
    apiKey: process.env.GROQ_API_KEY,
    // GROQ_MODELS (a chain) wins over the older single GROQ_MODEL, which is
    // still honoured so an existing deployment keeps its exact model.
    models: parseModelList(process.env.GROQ_MODELS).length > 0
      ? parseModelList(process.env.GROQ_MODELS)
      : process.env.GROQ_MODEL
        ? [process.env.GROQ_MODEL]
        : DEFAULT_GROQ_MODELS,
    headers: {},
  };
}
