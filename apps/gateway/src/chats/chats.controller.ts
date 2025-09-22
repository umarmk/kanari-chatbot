import { Body, Controller, Delete, Get, Headers, HttpException, HttpStatus, Param, Post, Query, Sse, UseGuards, Patch } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ChatsService } from './chats.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { UserId } from '../common/user.decorator';
import { Observable } from 'rxjs';
import { Throttle } from '@nestjs/throttler';

class CreateChatDto { @IsOptional() @IsString() title?: string }
class UpdateChatDto { @IsOptional() @IsString() title?: string }
class SendMessageDto { @IsString() content!: string }

@UseGuards(JwtAuthGuard)
@Controller()
export class ChatsController {
  constructor(private svc: ChatsService) {}

  // Chats under project
  @Post('projects/:projectId/chats')
  async createChat(@UserId() userId: string, @Param('projectId') projectId: string, @Body() dto: CreateChatDto) {
    await this.svc.ensureProjectOwnership(userId, projectId);
    return this.svc.createChat(userId, projectId, dto?.title);
  }
  @Get('projects/:projectId/chats')
  listChats(@UserId() userId: string, @Param('projectId') projectId: string) {
    return this.svc.listChats(userId, projectId);
  }

  // Chat
  @Get('chats/:id')
  async getChat(@UserId() userId: string, @Param('id') id: string) {
    const chat = await this.svc.getChat(userId, id);
    if (!chat) throw new HttpException('chat_not_found', HttpStatus.NOT_FOUND);
    return chat;
  }
  @Delete('chats/:id')
  deleteChat(@UserId() userId: string, @Param('id') id: string) {
    return this.svc.deleteChat(userId, id);
  }
  @Patch('chats/:id')
  updateChat(@UserId() userId: string, @Param('id') id: string, @Body() dto: UpdateChatDto) {
    return this.svc.updateChat(userId, id, dto);
  }

  // Messages
  @Get('chats/:id/messages')
  listMessages(@UserId() userId: string, @Param('id') id: string) {
    return this.svc.listMessages(userId, id);
  }
  @Post('chats/:id/messages')
  createMessage(@UserId() userId: string, @Param('id') id: string, @Body() dto: SendMessageDto) {
    if (!dto?.content) throw new HttpException('content_required', HttpStatus.BAD_REQUEST);
    return this.svc.createUserMessage(userId, id, dto.content);
  }

  // SSE streaming (GET with content query to keep it simple)
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // per-user/IP limit for streaming
  @Sse('chats/:id/stream')
  stream(
    @UserId() userId: string,
    @Param('id') id: string,
    @Query('content') content: string,
    @Headers('x-openrouter-key') openrouterKey?: string,
  ): Observable<MessageEvent> {
    if (!content) throw new HttpException('content_required', HttpStatus.BAD_REQUEST);
    return this.svc.streamAssistantReply(userId, id, content, openrouterKey);
  }
}

