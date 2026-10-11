import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { isHostedEnvironment, isLocalhostMongoUri } from './mongo-uri';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('MONGODB_URI');
        if (!uri) {
          throw new Error('MONGODB_URI is not set');
        }
        // Fail with the actual cause instead of retrying for five minutes and
        // dying as "No open ports detected" — see mongo-uri.ts.
        if (isHostedEnvironment() && isLocalhostMongoUri(uri)) {
          throw new Error(
            `MONGODB_URI points at localhost (${uri}), which cannot exist on a hosting ` +
              'platform — set it to the real cluster connection string.',
          );
        }
        return { uri };
      },
    }),
  ],
})
export class DatabaseModule {}
