import { AI_ROUTING_SYSTEM_PROMPT } from './prompts/ai-routing-system.prompt.js';

export class AiRoutingService {
  getPrompt() {
    return AI_ROUTING_SYSTEM_PROMPT;
  }
}

