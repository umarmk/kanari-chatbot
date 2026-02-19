import { Module } from '@nestjs/common';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { ContextService } from './context.service';
import { ModelsController } from './models.controller';

@Module({
  imports: [PrismaModule, JwtModule],
  controllers: [ChatsController, ModelsController],
  providers: [ChatsService, ContextService],
  exports: [ChatsService, ContextService],
})
export class ChatsModule {}
