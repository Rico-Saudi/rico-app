import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from './app.module';

// The broadest guard in the repo: it wires every module the way `npm start`
// does. A provider injected from a module nobody imported fails here rather
// than on Render, which is where the ComposeService/WeatherService mistake was
// found the first time.
describe('application boots', () => {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.SESSION_SECRET = 'test-secret';
  }, 60_000);

  afterAll(async () => {
    await mongod.stop();
  });

  it('resolves every provider in the graph', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  }, 60_000);
});
