declare module 'pdf-parse' {
  export interface PDFParseResult {
    numpages?: number;
    numrender?: number;
    info?: Record<string, any>;
    metadata?: any;
    version?: string;
    text: string;
  }
  export default function pdf(data: Buffer | Uint8Array): Promise<PDFParseResult>;
}

