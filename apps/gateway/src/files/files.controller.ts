import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { UserId } from '../common/user.decorator';
import { IsUUID } from 'class-validator';

const FILE_MAX_BYTES = Number(process.env.FILE_MAX_BYTES || 20 * 1024 * 1024);
const ALLOWED_MIME = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/pdf',
]);
function isAllowedMime(m: string): boolean {
  return m.startsWith('text/') || m.startsWith('image/') || ALLOWED_MIME.has(m);
}

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
      limits: { fileSize: FILE_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (isAllowedMime(file.mimetype)) return cb(null, true);
        const err = new Error('unsupported_file_type') as any;
        err.status = 400;
        return cb(err, false);
      },
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

