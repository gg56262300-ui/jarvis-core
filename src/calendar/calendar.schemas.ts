import { z } from 'zod';

export const googleCalendarAuthorizationSchema = z.object({
  code: z.string().trim().min(1, 'Google autoriseerimiskood on kohustuslik.'),
});

export const googleCalendarCreateEventSchema = z.object({
  title: z.string().trim().min(1, 'Sündmuse pealkiri on kohustuslik.'),
  start: z.string().trim().min(1, 'Algusaeg on kohustuslik.'),
  end: z.string().trim().min(1, 'Lõppaeg on kohustuslik.'),
  description: z.string().trim().optional(),
  location: z.string().trim().optional(),
});
