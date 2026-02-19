import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DEFAULT_MODEL_ID, isAllowedModel } from '../chats/models';

export interface CreateProjectInput {
  name: string;
  system_prompt?: string;
  model?: string | null;
  params?: Record<string, any> | null;
}

export interface UpdateProjectInput {
  name?: string;
  system_prompt?: string | null;
  model?: string | null;
  params?: Record<string, any> | null;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  // Create a project owned by the current user.
  // Model is validated against the backend allowlist to avoid key misuse and FE/BE drift.
  async create(userId: string, dto: CreateProjectInput) {
    const model = dto.model ?? DEFAULT_MODEL_ID;
    if (model && !isAllowedModel(model)) throw new BadRequestException('invalid_model');
    return this.prisma.project.create({
      data: {
        userId,
        name: dto.name,
        systemPrompt: dto.system_prompt ?? null,
        model,
        params: (dto.params as any) ?? undefined,
      },
    });
  }

  list(userId: string) {
    return this.prisma.project.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async get(userId: string, id: string) {
    const proj = await this.prisma.project.findUnique({ where: { id } });
    if (!proj) throw new NotFoundException('project_not_found');
    if (proj.userId !== userId) throw new ForbiddenException();
    return proj;
  }

  async patch(userId: string, id: string, dto: UpdateProjectInput) {
    await this.ensureOwnership(userId, id);
    // Reject unknown models early (prevents paid-model server key usage and keeps UX consistent).
    if (dto.model !== undefined && dto.model !== null && !isAllowedModel(dto.model)) {
      throw new BadRequestException('invalid_model');
    }
    return this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        systemPrompt: dto.system_prompt === undefined ? undefined : dto.system_prompt,
        model: dto.model === undefined ? undefined : dto.model,
        params: dto.params === undefined ? undefined : (dto.params as any),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwnership(userId, id);
    // Best-effort disk cleanup for uploaded files to prevent orphaned blobs when DB rows cascade-delete.
    // We capture the list before deleting the project row, then unlink afterwards.
    const files = await this.prisma.file.findMany({ where: { projectId: id }, select: { storageUrl: true } });
    await this.prisma.project.delete({ where: { id } });
    await Promise.all(
      files.map(async (f) => {
        const absPath = path.resolve(process.cwd(), f.storageUrl);
        await fs.unlink(absPath).catch(() => undefined);
      }),
    );
    return { success: true };
  }

  private async ensureOwnership(userId: string, id: string) {
    const proj = await this.prisma.project.findUnique({ where: { id }, select: { userId: true } });
    if (!proj) throw new NotFoundException('project_not_found');
    if (proj.userId !== userId) throw new ForbiddenException();
  }
}

