import { HttpException, HttpStatus, Injectable, Optional } from '@nestjs/common';
import { ApiUsageService, currentDay } from '../api-usage/api-usage.service';
import { LlmPurpose, ProviderConfig, providerFor } from './llm.constants';

/// Usage-table key for the daily LLM budget — every purpose shares it, since
/// they all bill the same account.
export const LLM_PROVIDER_USAGE_KEY = 'llm_calls';

/// Upper bound on model calls per UTC day, across every purpose. /classify
/// and /compose are public, so without a ceiling a script looping on them
/// spends without limit; the per-IP limiters slow one source down, this stops
/// many. At ~7k prompt tokens a call it is roughly $20–25/day on gpt-oss-120b
/// — far above real traffic today. Override with LLM_DAILY_CALL_CAP.
const DEFAULT_LLM_DAILY_CALL_CAP = 20000;

function dailyCallCap(): number {
  const raw = Number(process.env.LLM_DAILY_CALL_CAP);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LLM_DAILY_CALL_CAP;
}

export interface LlmMessage {
  role: string;
  content: string;
}

export interface LlmRequest {
  purpose: LlmPurpose;
  messages: LlmMessage[];
  temperature: number;
  maxTokens: number;
  /// Overrides the purpose's default deadline (see DEFAULT_TIMEOUT_MS).
  timeoutMs?: number;
}

/// How long one complete() may take, the whole model chain included.
///
/// The app gives /classify 8s on its first try and /compose 5s, and the old
/// fetch had no deadline at all — so a slow Groq answer arrived after the
/// app had given up, and the app's retry sent the same ~7k-token prompt a
/// second time while the first was still being billed. Ending a little
/// before the app does lets /classify answer from its keyword table in time,
/// and lets compose fail fast to the app's template.
const DEFAULT_TIMEOUT_MS: Record<LlmPurpose, number> = {
  classify: 7000,
  compose: 4500,
  training: 60000,
  simulate: 60000,
};

export interface LlmResult {
  /// The assistant's raw message content. Callers parse it — this service
  /// stays out of the business of knowing what shape each endpoint expects.
  content: string;
  /// Which model actually answered. On OpenRouter this can differ from the
  /// one we asked for, because a fallback fired.
  model: string | null;
}

/// The one place Rico talks to a language model.
///
/// Before this, /classify and /compose each held their own copy of the same
/// fetch, so changing provider meant editing both and keeping them in step.
/// Now the provider is config (see llm.constants) and the two endpoints only
/// describe what they want said.
@Injectable()
export class LlmService {
  /// Optional so scripts and specs can still `new LlmService()` without a
  /// database; the running server always injects it.
  constructor(@Optional() private readonly apiUsage?: ApiUsageService) {}

  async complete(request: LlmRequest): Promise<LlmResult> {
    const provider = providerFor(request.purpose);

    if (!provider.apiKey) {
      throw new HttpException({ error: 'server_misconfigured' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (provider.models.length === 0) {
      // Reached only by setting LLM_PROVIDER=openrouter without naming a
      // model — a config mistake, and one worth failing loudly rather than
      // silently guessing a model that bills.
      throw new HttpException({ error: 'server_misconfigured' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Reserved once per complete(), not per model tried: a 429 walk down the
    // chain is one answer to the customer. Over budget fails like an
    // unreachable upstream, so /classify falls back to its keyword table and
    // the app's compose falls back to its fixed template.
    if (this.apiUsage && !(await this.apiUsage.tryConsume(LLM_PROVIDER_USAGE_KEY, dailyCallCap(), 1, currentDay()))) {
      console.warn(`[llm] ${request.purpose}: daily call cap of ${dailyCallCap()} reached`);
      throw new HttpException({ error: 'llm_budget_exhausted' }, HttpStatus.SERVICE_UNAVAILABLE);
    }

    // Groq has no server-side failover, so the chain is walked here: a 429
    // on one model moves to the next, which has its own per-minute token
    // bucket. Any other error, or the last model's 429, surfaces as before.
    // OpenRouter gets the whole chain in one request and never loops.
    const attempts = provider.name === 'groq' ? provider.models : [provider.models[0]];
    // One deadline for the whole chain: a 429 walk is still one answer the
    // customer is waiting on.
    const signal = AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS[request.purpose]);
    let response: Response | undefined;
    let data: any;
    for (const [index, model] of attempts.entries()) {
      try {
        response = await fetch(provider.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json',
            ...provider.headers,
          },
          body: JSON.stringify(this.buildBody(provider, request, model)),
          signal,
        });
        // Read inside the try: the deadline can also land while the body
        // is still streaming in.
        if (response.ok) data = await response.json();
      } catch (e) {
        if (signal.aborted) {
          console.warn(`[llm] ${request.purpose}: ${model} timed out`);
          throw new HttpException({ error: 'upstream_timeout' }, HttpStatus.GATEWAY_TIMEOUT);
        }
        throw new HttpException({ error: 'upstream_unreachable' }, HttpStatus.BAD_GATEWAY);
      }

      if (response.status === 429 && index < attempts.length - 1) {
        console.warn(`[llm] ${request.purpose}: ${model} rate limited, trying ${attempts[index + 1]}`);
        continue;
      }
      break;
    }

    if (!response!.ok) {
      throw new HttpException({ error: 'upstream_error', status: response!.status }, HttpStatus.BAD_GATEWAY);
    }

    const content = data?.choices?.[0]?.message?.content;
    // `length` means max_tokens ran out mid-answer — on gpt-oss the hidden
    // reasoning counts against it too — so the JSON is cut off. Worth seeing
    // in the log: it is a budget to raise, not a model being wrong.
    if (data?.choices?.[0]?.finish_reason === 'length') {
      console.warn(`[llm] ${request.purpose}: answer cut off at max_tokens=${request.maxTokens}`);
    }
    if (typeof content !== 'string') {
      throw new HttpException({ error: 'parse_error' }, HttpStatus.BAD_GATEWAY);
    }

    const served = typeof data?.model === 'string' ? data.model : null;
    // Worth a line in the log: it means the model we chose was rate limited or
    // down, and the answer came from further down the chain. Silent failover
    // is the feature; silent failover we can't see afterwards is not.
    if (served && !served.startsWith(provider.models[0].split(':')[0])) {
      console.warn(`[llm] ${request.purpose} fell back to ${served} (asked for ${provider.models[0]})`);
    }

    return { content, model: served };
  }

  private buildBody(provider: ProviderConfig, request: LlmRequest, model: string): Record<string, unknown> {
    const body: Record<string, unknown> = {
      messages: request.messages,
      response_format: { type: 'json_object' },
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    };

    if (provider.name === 'openrouter' && provider.models.length > 1) {
      // OpenRouter routes down this list on rate limits, downtime, context
      // overflows and moderation refusals, and bills whichever model actually
      // answered. `models` and `model` are mutually exclusive, so a chain
      // sends only the array.
      body.models = provider.models;
    } else {
      body.model = model;
    }

    if (provider.name === 'groq' && model.includes('gpt-oss')) {
      // gpt-oss models spend tokens on hidden reasoning before the JSON
      // output; 'low' keeps that overhead inside the free tier's TPM cap.
      // OpenRouter spells this differently per model and silently drops
      // parameters it doesn't recognise, so it isn't sent there — and Groq
      // rejects it outright on models without a reasoning mode.
      body.reasoning_effort = 'low';
    }

    return body;
  }
}
