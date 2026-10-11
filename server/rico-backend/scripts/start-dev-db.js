// Spins up an ephemeral in-memory MongoDB for local dev/testing without
// needing Docker or a native MongoDB install. Prints a connection URI you
// can put in .env as MONGODB_URI, and keeps running until Ctrl+C.
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create();
const uri = mongod.getUri();
console.log('MONGODB_URI=' + uri);
console.log('Dev MongoDB running — keep this process alive, Ctrl+C to stop.');

process.on('SIGINT', async () => {
  await mongod.stop();
  process.exit(0);
});
