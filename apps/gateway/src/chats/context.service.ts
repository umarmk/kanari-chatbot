import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { promises as fs } from 'fs';
import * as path from 'path';
import pdf from 'pdf-parse';

// Minimal, dependency-free file context builder 
// - Reads text-like files from uploads/ and extracts text from PDFs
// - Splits into rough chunks
// - Ranks by simple token overlap against the query and recent messages
// - Returns a bounded context string with inline citations

const MAX_CHUNKS = Number(process.env.CONTEXT_MAX_CHUNKS || 6);
const MAX_CHARS_PER_CHUNK = Number(process.env.CONTEXT_MAX_CHARS_PER_CHUNK || 1200);

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function scoreChunk(queryTokens: Set<string>, chunkTokens: string[]): number {
  let score = 0;
  for (const t of chunkTokens) if (queryTokens.has(t)) score++;
  return score;
}

@Injectable()
export class ContextService {
  private readonly logger = new Logger('ContextService');
  constructor(private readonly prisma: PrismaService) {}

  async buildContextForChat(projectId: string, chatId: string, prompt: string): Promise<string | null> {
    // Build a simple query from the prompt + last 4 messages
    const recent = await this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
    const basis = [prompt, ...recent.map((m) => m.content)].join('\n');
    const queryTokens = new Set(tokenize(basis));

    // Load file records
    const files = await this.prisma.file.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, take: 50 });
    this.logger.log(`RAG: Found ${files.length} files for project ${projectId}`);

    const candidates: Array<{ fileId: string; name: string; chunk: string; idx: number; score: number }> = [];

    for (const f of files) {
      try {
        const abs = path.resolve(process.cwd(), f.storageUrl);
        this.logger.log(`RAG: Processing file ${f.name} (${f.mime}) at ${abs}`);

        let raw: string | null = null;
        if (f.mime === 'application/pdf') {
          // PDF: extract text using pdf-parse
          try {
            const buf = await fs.readFile(abs);
            const res = await pdf(buf);
            raw = (res?.text || '').trim();
            this.logger.log(`RAG: Extracted ${raw.length} chars from PDF ${f.name}`);
          } catch (err) {
            this.logger.warn(`RAG: Failed to extract PDF ${f.name}: ${err}`);
            raw = null;
          }
        } else {
          // Text-like: read as UTF-8
          const isText = f.mime.startsWith('text/') || f.mime === 'application/json' || f.mime === 'application/xml' || f.mime === 'application/javascript';
          if (isText) {
            raw = await fs.readFile(abs, 'utf8');
            this.logger.log(`RAG: Read ${raw.length} chars from text file ${f.name}`);
          } else {
            this.logger.log(`RAG: Skipping unsupported mime type ${f.mime} for ${f.name}`);
          }
        }

        if (!raw) continue; // skip unsupported/failed

        const chunks = this.chunkText(raw);
        this.logger.log(`RAG: Created ${chunks.length} chunks from ${f.name}`);

        for (let i = 0; i < chunks.length; i++) {
          const ctoks = tokenize(chunks[i]);
          const sc = scoreChunk(queryTokens, ctoks);
          // ALWAYS add chunks, even with score 0, so generic questions like "what's in this file?" work
          candidates.push({ fileId: f.id, name: f.name, chunk: chunks[i], idx: i + 1, score: sc });
          if (sc > 0) {
            this.logger.log(`RAG: Chunk ${i + 1} of ${f.name} scored ${sc}`);
          }
        }
      } catch (e) {
        this.logger.warn(`RAG: Failed to read file ${f.id} ${f.name}: ${e}`);
      }
    }

    if (!candidates.length) {
      this.logger.log('RAG: No chunks found (no files in project)');
      return null;
    }

    // Sort by score (highest first), but include even zero-scored chunks
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, MAX_CHUNKS);
    this.logger.log(`RAG: Selected top ${top.length} chunks (scores: ${top.map(c => c.score).join(', ')})`);

    // Compose context block - direct format since it's prepended to user message
    const lines: string[] = [];
    lines.push('[CONTEXT: The following are excerpts from files in your project]');
    lines.push('');

    for (const c of top) {
      const chunk = c.chunk.slice(0, MAX_CHARS_PER_CHUNK);
      lines.push(`File: ${c.name} (Part ${c.idx})`);
      lines.push(chunk);
      lines.push('');
    }

    lines.push('[END OF CONTEXT]');
    lines.push('');

    const context = lines.join('\n');
    this.logger.log(`RAG: Built context with ${context.length} chars from ${top.length} chunks`);
    return context;
  }

  private chunkText(raw: string): string[] {
    const paras = raw.split(/\n\n+/);
    const out: string[] = [];
    let acc = '';
    for (const p of paras) {
      if ((acc + '\n\n' + p).length > MAX_CHARS_PER_CHUNK && acc) {
        out.push(acc);
        acc = p.slice(0, MAX_CHARS_PER_CHUNK);
      } else {
        acc = acc ? acc + '\n\n' + p : p;
      }
    }
    if (acc) out.push(acc);
    return out;
  }
}
