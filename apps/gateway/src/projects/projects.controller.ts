import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { UserId } from '../common/user.decorator';
import { IsObject, IsOptional, IsString, MaxLength, MinLength, validateSync } from 'class-validator';

class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  system_prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, any>;
}

class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  system_prompt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string | null;

  @IsOptional()
  @IsObject()
  params?: Record<string, any> | null;
}

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Post()
  create(@UserId() userId: string, @Body() dto: CreateProjectDto) {
    return this.svc.create(userId, dto);
  }

  @Get()
  list(@UserId() userId: string) {
    return this.svc.list(userId);
  }

  @Get(':id')
  get(@UserId() userId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.get(userId, id);
  }

  @Patch(':id')
  patch(
    @UserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.svc.patch(userId, id, dto);
  }

  @Delete(':id')
  remove(@UserId() userId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(userId, id);
  }
}

