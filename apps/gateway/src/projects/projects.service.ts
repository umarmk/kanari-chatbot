import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

const DEFAULT_MODEL = 'x-ai/grok-4-fast:free';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateProjectInput) {
    return this.prisma.project.create({
      data: {
        userId,
        name: dto.name,
        systemPrompt: dto.system_prompt ?? null,
        model: dto.model ?? DEFAULT_MODEL,
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
    await this.prisma.project.delete({ where: { id } });
    return { success: true };
  }

  private async ensureOwnership(userId: string, id: string) {
    const proj = await this.prisma.project.findUnique({ where: { id }, select: { userId: true } });
    if (!proj) throw new NotFoundException('project_not_found');
    if (proj.userId !== userId) throw new ForbiddenException();
  }
}

