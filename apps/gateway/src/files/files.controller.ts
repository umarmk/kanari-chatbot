import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { UserId } from '../common/user.decorator';
import { IsUUID } from 'class-validator';

class UploadQueryDto {
  @IsUUID()
  project_id!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly svc: FilesService) {}

  @Get()
  list(@UserId() userId: string, @Query() q: UploadQueryDto) {
    return this.svc.list(userId, q.project_id);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      dest: 'uploads',
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  upload(
    @UserId() userId: string,
    @Query() q: UploadQueryDto,
    @UploadedFile() file: any,
  ) {
    return this.svc.create(userId, q.project_id, file);
  }

  @Delete(':id')
  remove(@UserId() userId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(userId, id);
  }
}

