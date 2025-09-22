import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { promises as fs } from 'fs';
import * as path from 'path';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureUploadDir() {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }

  async assertProjectOwnership(userId: string, projectId: string) {
    const proj = await this.prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
    if (!proj) throw new NotFoundException('project_not_found');
    if (proj.userId !== userId) throw new ForbiddenException();
  }

  async list(userId: string, projectId: string) {
    await this.assertProjectOwnership(userId, projectId);
    return this.prisma.file.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  }

  async create(userId: string, projectId: string, file: any) {
    await this.ensureUploadDir();
    await this.assertProjectOwnership(userId, projectId);

    const storageRel = path.join('uploads', file.filename);
    return this.prisma.file.create({
      data: {
        userId,
        projectId,
        name: file.originalname,
        mime: file.mimetype,
        size: file.size,
        storageUrl: storageRel,
      },
    });
  }

  async remove(userId: string, fileId: string) {
    const f = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!f) throw new NotFoundException('file_not_found');
    await this.assertProjectOwnership(userId, f.projectId);

    const absPath = path.resolve(process.cwd(), f.storageUrl);
    await fs.unlink(absPath).catch(() => undefined);
    await this.prisma.file.delete({ where: { id: fileId } });
    return { success: true };
  }
}

