import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { LlmPurpose, ProviderConfig, providerFor } from './llm.constants';

export interface LlmMessage {
  role: string;
  content: string;
}

export interface LlmRequest {
  purpose: LlmPurpose;
  messages: LlmMessage[];
  temperature: number;
  maxTokens: number;
}

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

    let response: Response;
    try {
      response = await fetch(provider.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
          ...provider.headers,
        },
        body: JSON.stringify(this.buildBody(provider, request)),
      });
    } catch {
      throw new HttpException({ error: 'upstream_unreachable' }, HttpStatus.BAD_GATEWAY);
    }

    if (!response.ok) {
      throw new HttpException({ error: 'upstream_error', status: response.status }, HttpStatus.BAD_GATEWAY);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
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

  private buildBody(provider: ProviderConfig, request: LlmRequest): Record<string, unknown> {
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
      body.model = provider.models[0];
    }

    if (provider.name === 'groq') {
      // gpt-oss models spend tokens on hidden reasoning before the JSON
      // output; 'low' keeps that overhead inside the free tier's TPM cap.
      // OpenRouter spells this differently per model and silently drops
      // parameters it doesn't recognise, so it isn't sent there.
      body.reasoning_effort = 'low';
    }

    return body;
  }
}
