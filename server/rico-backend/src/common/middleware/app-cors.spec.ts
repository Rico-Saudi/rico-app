import { isAllowedOrigin } from './app-cors';

describe('isAllowedOrigin', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('lets the phone app through, which sends no Origin at all', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin('')).toBe(true);
  });

  it('allows the app host, where the dashboards and any web build are served', () => {
    expect(isAllowedOrigin('https://app.rico-go.com')).toBe(true);
  });

  it('refuses any other site — it used to be able to spend a Groq call', () => {
    process.env.NODE_ENV = 'production';
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    // A near-miss on the real host is still another site.
    expect(isAllowedOrigin('https://app.rico-go.com.evil.example')).toBe(false);
    expect(isAllowedOrigin('http://app.rico-go.com')).toBe(false);
  });

  it('allows localhost while developing, and not in production', () => {
    delete process.env.NODE_ENV;
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:3000')).toBe(true);

    process.env.NODE_ENV = 'production';
    expect(isAllowedOrigin('http://localhost:5173')).toBe(false);
  });

  it('takes extra origins from CORS_ORIGINS, for a web build hosted elsewhere', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://rico.example, https://beta.rico.example';
    expect(isAllowedOrigin('https://rico.example')).toBe(true);
    expect(isAllowedOrigin('https://beta.rico.example')).toBe(true);
    expect(isAllowedOrigin('https://other.example')).toBe(false);
  });
});
