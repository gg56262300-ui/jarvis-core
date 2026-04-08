import { z } from 'zod';

export const voiceTurnSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  locale: z.string().trim().min(2).default('et-EE'),
  source: z.enum(['speech', 'text']).default('text'),
});

