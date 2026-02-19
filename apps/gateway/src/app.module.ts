import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { ProjectsModule } from './projects/projects.module';
import { FilesModule } from './files/files.module';
import { ChatsModule } from './chats/chats.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Centralized environment validation.
      // This fails fast on misconfiguration (especially important for production deployments).
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        PORT: Joi.number().integer().min(1).max(65535).optional(),

        DATABASE_URL: Joi.string().uri().required(),
        JWT_ACCESS_SECRET: Joi.string().required(),
        REDIS_URL: Joi.string().uri().optional(),
        GATEWAY_PUBLIC_URL: Joi.string().uri().optional(),
        WEB_URL: Joi.string()
          .custom((value, helpers) => {
            // WEB_URL is also used as a CORS allowlist and as the OAuth redirect base (first entry).
            const parts = String(value)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            if (!parts.length) return helpers.error('any.invalid');
            for (const p of parts) {
              const { error } = Joi.string().uri().validate(p);
              if (error) return helpers.error('any.invalid');
            }
            return value;
          })
          .when('NODE_ENV', { is: 'production', then: Joi.required(), otherwise: Joi.optional() }),
        GOOGLE_CLIENT_ID: Joi.string().optional(),
        GOOGLE_CLIENT_SECRET: Joi.string().optional(),
        SESSION_SIGNING_KEY: Joi.string().when('NODE_ENV', {
          is: 'production',
          then: Joi.string().required(),
          otherwise: Joi.string().optional(),
        }),
        OPENROUTER_API_KEY: Joi.string().optional(),
        OPENROUTER_STREAM_TIMEOUT_MS: Joi.number().integer().min(1000).optional(),
        FILE_MAX_BYTES: Joi.number().integer().min(1).optional(),
        CONTEXT_MAX_CHUNKS: Joi.number().integer().min(1).optional(),
        CONTEXT_MAX_CHARS_PER_CHUNK: Joi.number().integer().min(1).optional(),
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    RedisModule,
    AuthModule,
    ProjectsModule,
    FilesModule,
    ChatsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
