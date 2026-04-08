import { TRANSLATION_SYSTEM_PROMPT } from './prompts/translation-system.prompt.js';

export class TranslationService {
  getPrompt() {
    return TRANSLATION_SYSTEM_PROMPT;
  }
}

