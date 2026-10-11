import { isHostedEnvironment, isLocalhostMongoUri } from './mongo-uri';

describe('isLocalhostMongoUri', () => {
  it('catches the .env.example value, the one most likely to be pasted', () => {
    expect(isLocalhostMongoUri('mongodb://localhost:27017/rico')).toBe(true);
  });

  it('catches the other loopback spellings', () => {
    expect(isLocalhostMongoUri('mongodb://127.0.0.1:27017/rico')).toBe(true);
    expect(isLocalhostMongoUri('mongodb://[::1]:27017/rico')).toBe(true);
    expect(isLocalhostMongoUri('mongodb://0.0.0.0:27017')).toBe(true);
    expect(isLocalhostMongoUri('mongodb://LOCALHOST/rico')).toBe(true);
  });

  it('sees through credentials, including an @ in the password', () => {
    expect(isLocalhostMongoUri('mongodb://user:p@ss@localhost:27017/rico')).toBe(true);
    expect(isLocalhostMongoUri('mongodb://user:p@ss@cluster0.abcd.mongodb.net/rico')).toBe(false);
  });

  it('leaves real clusters alone', () => {
    expect(isLocalhostMongoUri('mongodb+srv://u:p@cluster0.abcd.mongodb.net/rico?retryWrites=true')).toBe(false);
    expect(isLocalhostMongoUri('mongodb://db-primary.internal:27017/rico')).toBe(false);
  });

  it('allows a replica set that only partly names a local seed', () => {
    expect(isLocalhostMongoUri('mongodb://localhost:27017,db.internal:27017/rico')).toBe(false);
  });

  it('stays out of the way of anything it cannot parse', () => {
    expect(isLocalhostMongoUri('')).toBe(false);
    expect(isLocalhostMongoUri('not-a-uri')).toBe(false);
    expect(isLocalhostMongoUri('postgres://localhost:5432/db')).toBe(false);
  });
});

describe('isHostedEnvironment', () => {
  it('trusts NODE_ENV when it is set', () => {
    expect(isHostedEnvironment({ NODE_ENV: 'production' })).toBe(true);
    expect(isHostedEnvironment({ NODE_ENV: 'development' })).toBe(false);
  });

  // The guard exists for misconfigured deploys, and an unset NODE_ENV is
  // itself a misconfiguration, so the platform's own flag has to count.
  it('still recognizes Render when NODE_ENV was forgotten', () => {
    expect(isHostedEnvironment({ RENDER: 'true' })).toBe(true);
  });

  it('treats a bare local shell as local', () => {
    expect(isHostedEnvironment({})).toBe(false);
  });
});
