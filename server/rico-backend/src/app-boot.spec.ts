import mongoose from 'mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from './app.module';

// The broadest guard in the repo: it wires every module the way `npm start`
// does. A provider injected from a module nobody imported fails here rather
// than on Render, which is where the ComposeService/WeatherService mistake was
// found the first time.
describe('application boots', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.SESSION_SECRET = 'test-secret';
  }, 60_000);

  // Torn down in the order the handles were opened, and in afterAll rather
  // than inside the test: booting the whole app opens a Mongoose connection
  // that outlives the assertion, and leaving it behind makes Jest force-kill
  // the worker and report this suite as failed on an otherwise clean run.
  afterAll(async () => {
    await moduleRef?.close();
    await mongoose.disconnect();
    await mongod.stop();
  }, 60_000);

  it('resolves every provider in the graph', async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef).toBeDefined();
  }, 60_000);
});
