// A MongoDB connection string that names localhost is the single most likely
// misconfiguration on a PaaS: .env.example ships
// `mongodb://localhost:27017/rico`, and pasting that into a dashboard is one
// copy away. There is no mongod on the instance, so it can never connect.
//
// What makes it worth failing fast on is how it *presents*: MongooseModule
// retries ~10 times over ~5 minutes, and since bootstrap awaits the module
// before app.listen(), the process dies without ever binding a port. The
// operator sees "No open ports detected — bind your service to at least one
// port", which points at the web server, not at the connection string.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/** Hosts named by a mongodb:// or mongodb+srv:// connection string, ignoring
 * credentials (which may themselves contain '@' or '/'), the database and any
 * options. Returns [] for anything unparseable — an unrecognized shape is the
 * driver's problem to report, not ours to guess at. */
function hostsOf(uri: string): string[] {
  const afterScheme = uri.replace(/^mongodb(?:\+srv)?:\/\//i, '');
  if (afterScheme === uri) return [];
  // credentials end at the LAST '@' before the host list, since a password
  // may legally contain '@' when percent-encoded loosely
  const hostPart = afterScheme.slice(afterScheme.lastIndexOf('@') + 1).split(/[/?]/)[0];
  return hostPart
    .split(',')
    .map((host) => host.trim().replace(/:\d+$/, '').toLowerCase())
    .filter(Boolean);
}

/** True when every host in the string is a loopback address. A replica set
 * that merely includes a local seed alongside real ones is left alone. */
export function isLocalhostMongoUri(uri: string): boolean {
  const hosts = hostsOf(uri);
  return hosts.length > 0 && hosts.every((host) => LOCAL_HOSTS.has(host));
}

/** Whether this process is running on a hosting platform rather than a
 * developer's machine. NODE_ENV alone is not enough: it is easy to forget to
 * set, and forgetting it is exactly the situation this guard exists for.
 * RENDER is set by Render on every instance. */
export function isHostedEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production' || Boolean(env.RENDER);
}
