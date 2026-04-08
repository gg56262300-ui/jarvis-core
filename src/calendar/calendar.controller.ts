import type { Request, Response } from 'express';

import { validateRequestBody } from '../shared/http/validate.js';
import {
  googleCalendarAuthorizationSchema,
  googleCalendarCreateEventSchema,
} from './calendar.schemas.js';
import type { CalendarService } from './calendar.service.js';

export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  async getAuthorizationUrl(_request: Request, response: Response) {
    const result = await this.calendarService.getAuthorizationUrl();
    response.json(result);
  }

  async authorize(request: Request, response: Response) {
    const input = validateRequestBody(
      googleCalendarAuthorizationSchema,
      request,
      'Vigane Google Calendri autoriseerimise sisu',
    );

    const result = await this.calendarService.completeAuthorization(input.code);
    response.json(result);
  }

  async createEvent(request: Request, response: Response) {
    const input = validateRequestBody(
      googleCalendarCreateEventSchema,
      request,
      'Vigane Google Calendri sündmuse sisu',
    );

    const result = await this.calendarService.createEvent(input);
    response.json(result);
  }
}
