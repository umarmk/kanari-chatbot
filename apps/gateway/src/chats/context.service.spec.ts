import { ContextService } from './context.service';

// Minimal PrismaService mock
class PrismaMock {
  message = {
    findMany: jest.fn(),
  } as any;
  file = {
    findMany: jest.fn(),
  } as any;
}

import * as fsModule from 'fs';

jest.mock('pdf-parse', () => jest.fn(async (_buf: any) => ({ text: 'pdf extracted text with beta token' })));

describe('ContextService', () => {
  let prisma: PrismaMock;
  let svc: ContextService;

  beforeEach(() => {
    prisma = new PrismaMock();
    svc = new ContextService(prisma as any);
    jest.spyOn(fsModule.promises, 'readFile').mockReset();
  });

  it('returns null when there are no files', async () => {
    prisma.message.findMany.mockResolvedValue([]);
    prisma.file.findMany.mockResolvedValue([]);

    const res = await svc.buildContextForChat('p1', 'c1', 'hello world');
    expect(res).toBeNull();
  });

  it('builds context from text files and includes citation', async () => {
    prisma.message.findMany.mockResolvedValue([{ content: 'alpha keyword from recent' }]);
    prisma.file.findMany.mockResolvedValue([
      { id: 'f1', name: 'notes.txt', mime: 'text/plain', storageUrl: 'uploads/notes.txt', projectId: 'p1' },
    ]);
    jest.spyOn(fsModule.promises, 'readFile').mockImplementation(async (_p: any, enc?: any) => {
      if (enc === 'utf8') return 'This is some text.\n\nAlpha appears here in this paragraph.';
      // Buffer path (PDF) not used in this test
      return Buffer.from('n/a');
    });

    const res = await svc.buildContextForChat('p1', 'c1', 'question about alpha');
    expect(res).toBeTruthy();
    expect(res!).toContain('File: notes.txt');
    expect(res!).toMatch(/Alpha appears here/i);
  });

  it('extracts from PDF when present', async () => {
    prisma.message.findMany.mockResolvedValue([{ content: 'beta term' }]);
    prisma.file.findMany.mockResolvedValue([
      { id: 'pf', name: 'doc.pdf', mime: 'application/pdf', storageUrl: 'uploads/doc.pdf', projectId: 'p1' },
    ]);
    jest.spyOn(fsModule.promises, 'readFile').mockResolvedValue(Buffer.from('pdfdata'));

    const res = await svc.buildContextForChat('p1', 'c1', 'ask about beta');
    expect(res).toBeTruthy();
    expect(res!).toContain('File: doc.pdf');
    expect(res!).toMatch(/beta token/i);
  });
});
