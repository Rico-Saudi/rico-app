import { LlmService } from './llm.service';
import { providerFor } from './llm.constants';

// A provider swap is a config change, so the config is the thing that can
// break silently: point at the wrong base URL, forget a model chain, or send
// a Groq-only parameter to OpenRouter, and you find out in production.
describe('LLM gateway', () => {
  const ENV = process.env;

  const okResponse = (content: string, model = 'openai/gpt-oss-120b') => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }], model }),
  });

  const lastBody = (mock: jest.Mock) => JSON.parse(mock.mock.calls[0][1].body);
  const lastUrl = (mock: jest.Mock) => mock.mock.calls[0][0];
  const lastHeaders = (mock: jest.Mock) => mock.mock.calls[0][1].headers;

  const request = (purpose: 'classify' | 'compose' = 'classify') => ({
    purpose,
    messages: [{ role: 'user', content: 'أقرب مطعم' }],
    temperature: 0.2,
    maxTokens: 500,
  });

  beforeEach(() => {
    process.env = { ...ENV };
    delete process.env.LLM_PROVIDER;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_CLASSIFY_MODELS;
    delete process.env.OPENROUTER_COMPOSE_MODELS;
    delete process.env.GROQ_MODEL;
    delete process.env.GROQ_MODELS;
  });

  afterAll(() => {
    process.env = ENV;
  });

  describe('defaults', () => {
    it('still talks to Groq with its previous settings when nothing is configured', () => {
      // The safety property of this whole module: deploying it changes
      // nothing until LLM_PROVIDER is set.
      process.env.GROQ_API_KEY = 'k';
      const provider = providerFor('classify');

      expect(provider.name).toBe('groq');
      expect(provider.url).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(provider.models).toEqual(['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
    });

    it('honours a single GROQ_MODEL from an existing deployment, and lets GROQ_MODELS name a chain', () => {
      process.env.GROQ_API_KEY = 'k';
      process.env.GROQ_MODEL = 'openai/gpt-oss-120b';
      expect(providerFor('classify').models).toEqual(['openai/gpt-oss-120b']);

      process.env.GROQ_MODELS = 'openai/gpt-oss-120b, qwen/qwen3.8-27b';
      expect(providerFor('classify').models).toEqual(['openai/gpt-oss-120b', 'qwen/qwen3.8-27b']);
    });

    it('sends reasoning_effort to Groq but not to OpenRouter', async () => {
      process.env.GROQ_API_KEY = 'k';
      const fetchMock = jest.fn().mockResolvedValue(okResponse('{}'));
      global.fetch = fetchMock as any;

      await new LlmService().complete(request());
      expect(lastBody(fetchMock).reasoning_effort).toBe('low');

      process.env.LLM_PROVIDER = 'openrouter';
      process.env.OPENROUTER_API_KEY = 'k';
      process.env.OPENROUTER_MODEL = 'google/gemini-3-flash';
      const orMock = jest.fn().mockResolvedValue(okResponse('{}'));
      global.fetch = orMock as any;

      await new LlmService().complete(request());
      // OpenRouter silently drops parameters it doesn't recognise, so sending
      // it would be a lie we could never see.
      expect(lastBody(orMock).reasoning_effort).toBeUndefined();
    });
  });

  describe('OpenRouter routing', () => {
    beforeEach(() => {
      process.env.LLM_PROVIDER = 'openrouter';
      process.env.OPENROUTER_API_KEY = 'k';
    });

    it('lets each endpoint name its own model chain', () => {
      process.env.OPENROUTER_CLASSIFY_MODELS = 'google/gemini-3-flash, meta-llama/llama-4';
      process.env.OPENROUTER_COMPOSE_MODELS = 'groq/llama-3.3-70b';

      // Classification wants reasoning; composition wants speed. They should
      // not be forced onto the same model.
      expect(providerFor('classify').models).toEqual(['google/gemini-3-flash', 'meta-llama/llama-4']);
      expect(providerFor('compose').models).toEqual(['groq/llama-3.3-70b']);
    });

    it('falls back to the shared model when an endpoint names none', () => {
      process.env.OPENROUTER_MODEL = 'google/gemini-3-flash';
      expect(providerFor('compose').models).toEqual(['google/gemini-3-flash']);
    });

    it('ignores empty entries from a trailing comma', () => {
      process.env.OPENROUTER_CLASSIFY_MODELS = 'a/b, ,c/d,';
      expect(providerFor('classify').models).toEqual(['a/b', 'c/d']);
    });

    it('sends a chain as `models` so OpenRouter can fail over inside one request', async () => {
      process.env.OPENROUTER_CLASSIFY_MODELS = 'google/gemini-3-flash,meta-llama/llama-4';
      const fetchMock = jest.fn().mockResolvedValue(okResponse('{}', 'google/gemini-3-flash'));
      global.fetch = fetchMock as any;

      await new LlmService().complete(request());

      const body = lastBody(fetchMock);
      expect(body.models).toEqual(['google/gemini-3-flash', 'meta-llama/llama-4']);
      // The two are mutually exclusive in OpenRouter's API.
      expect(body.model).toBeUndefined();
      expect(lastUrl(fetchMock)).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(lastHeaders(fetchMock)['X-Title']).toBe('Rico');
    });

    it('sends a single model as `model`, not a one-item chain', async () => {
      process.env.OPENROUTER_MODEL = 'google/gemini-3-flash';
      const fetchMock = jest.fn().mockResolvedValue(okResponse('{}'));
      global.fetch = fetchMock as any;

      await new LlmService().complete(request());

      expect(lastBody(fetchMock).model).toBe('google/gemini-3-flash');
      expect(lastBody(fetchMock).models).toBeUndefined();
    });

    it('reports which model actually answered', async () => {
      process.env.OPENROUTER_CLASSIFY_MODELS = 'google/gemini-3-flash,meta-llama/llama-4';
      global.fetch = jest.fn().mockResolvedValue(okResponse('{"ok":true}', 'meta-llama/llama-4')) as any;

      const result = await new LlmService().complete(request());
      expect(result.model).toBe('meta-llama/llama-4');
      expect(result.content).toBe('{"ok":true}');
    });

    it('refuses to run with no model named rather than guessing one that bills', async () => {
      await expect(new LlmService().complete(request())).rejects.toMatchObject({
        response: { error: 'server_misconfigured' },
      });
    });
  });

  describe('Groq rate limits', () => {
    beforeEach(() => {
      process.env.GROQ_API_KEY = 'k';
      process.env.GROQ_MODELS = 'openai/gpt-oss-120b,openai/gpt-oss-20b';
    });

    it('moves to the next model when the first answers 429', async () => {
      // Groq meters tokens per minute per model, so the sibling has its own
      // bucket — that is the whole point of the chain.
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce(okResponse('{"ok":true}', 'openai/gpt-oss-20b'));
      global.fetch = fetchMock as any;

      const result = await new LlmService().complete(request());

      expect(result.content).toBe('{"ok":true}');
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('openai/gpt-oss-120b');
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('openai/gpt-oss-20b');
    });

    it('still reports a 429 when the whole chain is rate limited', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 429 });
      global.fetch = fetchMock as any;
      await expect(new LlmService().complete(request())).rejects.toMatchObject({
        response: { error: 'upstream_error', status: 429 },
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry other errors on the next model', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500 });
      global.fetch = fetchMock as any;
      await expect(new LlmService().complete(request())).rejects.toMatchObject({
        response: { error: 'upstream_error', status: 500 },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('only sends reasoning_effort to models that have a reasoning mode', async () => {
      process.env.GROQ_MODELS = 'qwen/qwen3.8-27b';
      const fetchMock = jest.fn().mockResolvedValue(okResponse('{}', 'qwen/qwen3.8-27b'));
      global.fetch = fetchMock as any;
      await new LlmService().complete(request());
      expect(lastBody(fetchMock).reasoning_effort).toBeUndefined();
    });
  });

  describe('failures', () => {
    beforeEach(() => {
      process.env.GROQ_API_KEY = 'k';
      process.env.GROQ_MODELS = 'openai/gpt-oss-120b';
    });

    it('reports a missing key as our misconfiguration, not an upstream fault', async () => {
      delete process.env.GROQ_API_KEY;
      await expect(new LlmService().complete(request())).rejects.toMatchObject({
        response: { error: 'server_misconfigured' },
      });
    });

    it('separates an unreachable provider from one that answered with an error', async () => {
      // The client retries the first and not the second, so the distinction
      // has to survive this layer.
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as any;
      await expect(new LlmService().complete(request())).rejects.toMatchObject({
        response: { error: 'upstream_unreachable' },
      });

      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 }) as any;
      await expect(new LlmService().complete(request())).rejects.toMatchObject({
        response: { error: 'upstream_error', status: 429 },
      });
    });

    it('treats a response with no message content as a parse failure', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) }) as any;
      await expect(new LlmService().complete(request())).rejects.toMatchObject({
        response: { error: 'parse_error' },
      });
    });
  });
});
