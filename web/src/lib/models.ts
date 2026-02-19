// Centralized model metadata and helpers for the web app.

export const FREE_MODELS = [
  { id: 'deepseek/deepseek-chat-v3.1:free', label: 'DeepSeek Chat v3.1 (Free)' },
  { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash Exp (Free)' },
  { id: 'minimax/minimax-m2:free', label: 'Minimax M2 (Free)' },
  { id: 'z-ai/glm-4.5-air:free', label: 'GLM 4.5 Air (Free)' },
];

export const PAID_MODELS = [
  { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Paid)' },
  { id: 'google/gemini-2.0-flash-lite-001', label: 'Gemini 2.0 Flash Lite 001 (Paid)' },
  { id: 'openai/gpt-5-nano', label: 'GPT‑5 Nano (Paid)' },
];

export function isPaidModel(id?: string | null): boolean {
  if (!id) return false; // default is free in current backend
  if (id.endsWith(':free')) return false;
  // If not recognized but lacks :free suffix, treat as paid to be safe
  return true;
}

export function getModelLabel(id?: string | null): string {
  if (!id) return 'Default model';
  const found = [...FREE_MODELS, ...PAID_MODELS].find((m) => m.id === id);
  return found?.label || id;
}

