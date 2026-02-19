export type ModelAccess = 'free' | 'paid';

export type ModelInfo = {
  id: string;
  label: string;
  access: ModelAccess;
};

// Single source of truth for supported models.
// Backend enforces this allowlist for Project.model and for paid/free key behavior.
export const MODELS: readonly ModelInfo[] = [
  { id: 'openai/gpt-oss-120b:free', label: 'OpenAI gpt-oss 120B (Free)', access: 'free' },
  { id: 'deepseek/deepseek-r1-0528:free', label: 'DeepSeek R1-0528 (Free)', access: 'free' },
  { id: 'arcee-ai/trinity-large-preview:free', label: 'Arcee Trinity Large (Free)', access: 'free' },
  { id: 'z-ai/glm-4.5-air:free', label: 'Z-AI GLM 4.5 Air (Free)', access: 'free' },

  { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Paid)', access: 'paid' },
  { id: 'google/gemini-2.0-flash-lite-001', label: 'Gemini 2.0 Flash Lite 001 (Paid)', access: 'paid' },
  { id: 'openai/gpt-5-nano', label: 'GPT-5 Nano (Paid)', access: 'paid' },
] as const;

export const FREE_MODELS = MODELS.filter((m) => m.access === 'free');
export const PAID_MODELS = MODELS.filter((m) => m.access === 'paid');

// The default model used when a project doesn't specify one.
export const DEFAULT_MODEL_ID = 'openai/gpt-oss-120b:free';

const ALLOWED_MODEL_IDS = new Set(MODELS.map((m) => m.id));
const PAID_MODEL_IDS = new Set(PAID_MODELS.map((m) => m.id));
const FREE_MODEL_IDS = new Set(FREE_MODELS.map((m) => m.id));

export function isAllowedModel(id: string): boolean {
  return ALLOWED_MODEL_IDS.has(id);
}

// Note: we intentionally treat "paid" and "free" strictly by allowlist membership.
// Unknown models are rejected elsewhere (invalid_model).
export function isPaidModel(id: string): boolean {
  return PAID_MODEL_IDS.has(id);
}

export function isFreeModel(id: string): boolean {
  return FREE_MODEL_IDS.has(id);
}
