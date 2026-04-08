import { z } from 'zod';

export const createReminderSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
});

export const reminderIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

