import { Controller, Get } from '@nestjs/common';
import { DEFAULT_MODEL_ID, MODELS } from './models';

// Lightweight endpoint for the SPA to fetch the backend model allowlist.
@Controller('models')
export class ModelsController {
  @Get()
  list() {
    return { models: MODELS, default_model: DEFAULT_MODEL_ID };
  }
}
