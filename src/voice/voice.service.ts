import { CalendarService } from '../calendar/calendar.service.js';
import { CalculatorService } from '../calculator/calculator.service.js';
import { ContactsService } from '../contacts/contacts.service.js';
import { GmailService } from '../gmail/gmail.service.js';
import http from 'node:http';
import { JobsService } from '../jobs/jobs.service.js';
import { RemindersRepository } from '../reminders/reminders.repository.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { TimeService } from '../time/time.service.js';
import { WeatherService } from '../weather/weather.service.js';
import { databaseProvider } from '../shared/database/index.js';
import { logger } from '../shared/logger/logger.js';
import { AppError } from '../shared/errors/app-error.js';
import { VOICE_SYSTEM_PROMPT } from './prompts/voice-system.prompt.js';
import { parseReminderCommand } from './reminder-command.parser.js';
import { parseCalendarCreateCommand } from './calendar-command.parser.js';
import { parseCalendarUpdateCommand } from './calendar-update-command.parser.js';
import type { VoiceAssistantProvider } from './voice-provider.js';
import type { VoiceCapabilities, VoiceTurnInput, VoiceTurnResult } from './voice.types.js';

export class VoiceService {
  private readonly calendarService = new CalendarService();
  private readonly calculatorService = new CalculatorService();
  private readonly contactsService = new ContactsService();
  private readonly gmailService = new GmailService();
  private readonly remindersRepository = new RemindersRepository(databaseProvider);
  private readonly remindersService = new RemindersService(this.remindersRepository);
  private readonly jobsService = new JobsService();
  private readonly timeService = new TimeService();
  private readonly weatherService = new WeatherService();

  constructor(private readonly voiceAssistantProvider: VoiceAssistantProvider) {
    this.remindersRepository.initialize();
  }

  getPrompt() {
    return VOICE_SYSTEM_PROMPT;
  }

  getCapabilities(): VoiceCapabilities {
    return {
      locale: 'et-EE',
      supportsStt: false,
      supportsTts: false,
      provider: 'openai-gpt-4o-mini',
    };
  }

  async createTurn(input: VoiceTurnInput): Promise<VoiceTurnResult> {
    const transcript = input.text.trim();
    const normalized = transcript.toLowerCase();
    const gmailReadPosition = this.parseGmailReadPosition(transcript);
    const gmailLatestCount = this.parseGmailLatestCount(transcript);
    const gmailSenderSearch = this.parseGmailSenderSearch(transcript);
    const gmailSubjectSearch = this.parseGmailSubjectSearch(transcript);
    const gmailReadFoundPosition = this.parseGmailReadFoundPosition(transcript);
    const gmailReadLatestBySender = this.parseGmailReadLatestBySender(transcript);
    const gmailReadLatestBySubject = this.parseGmailReadLatestBySubject(transcript);
    const wantsUnreadList = this.isGmailUnreadListCommand(normalized);
    const wantsUnreadReadLatest = normalized === 'loe viimane lugemata kiri';
    const gmailSenderCount = this.parseGmailSenderCount(transcript);
    const gmailSubjectCount = this.parseGmailSubjectCount(transcript);
    const wantsUnreadCount = normalized === 'mitu lugemata kirja';
    const contactSearchQuery = this.parseContactSearchQuery(transcript);
    const calculatorExpression = this.parseCalculatorExpression(transcript);
    const weatherPlaceQuery = this.parseWeatherPlaceQuery(transcript);
    const calendarCreateCommand = normalized.startsWith('lisa kalendrisse')
      ? parseCalendarCreateCommand(transcript)
      : null;
    const calendarDeleteTitle = normalized.startsWith('kustuta kalendrist')
      ? transcript.replace(/^kustuta kalendrist[:\s-]*/i, '').trim()
      : null;
    const calendarUpdateCommand = normalized.startsWith('muuda kalendris')
      ? parseCalendarUpdateCommand(transcript)
      : null;

    if (normalized.startsWith('lisa meeldetuletus')) {
      const parsedReminderCommand = parseReminderCommand(transcript);
      const title = parsedReminderCommand.title;

      if (!title) {
        return {
          transcript,
          responseText: 'Palun ütle meeldetuletuse sisu pärast sõnu lisa meeldetuletus.',
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      }

      const reminder = this.remindersService.create({
        title,
        dueAt: parsedReminderCommand.dueAt,
      });

      let queuedJob = null;

      if (reminder.dueAt) {
        queuedJob = await this.jobsService.enqueueReminderJob(reminder.id, reminder.title, reminder.dueAt);
      }

      const responseText = parsedReminderCommand.dueAtParseFailed
        ? `Tegin meeldetuletuse: ${reminder.title}. Tähtaega ma ei saanud aru, seega salvestasin selle ilma tähtajata.`
        : queuedJob
          ? `Tegin meeldetuletuse: ${reminder.title}. Reminder-job lisati queue'sse.`
          : `Tegin meeldetuletuse: ${reminder.title}.`;

      return {
        transcript,
        responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (normalized === 'näita meeldetuletusi' || normalized === 'näita meeldetuletused') {
      const reminders = this.remindersService.list();
      const activeReminders = reminders.filter((item) => !item.isDone);

      const responseText =
        activeReminders.length === 0
          ? 'Sul ei ole praegu ühtegi aktiivset meeldetuletust.'
          : `Sul on ${activeReminders.length} aktiivset meeldetuletust: ${activeReminders
              .map((item) => item.title)
              .join('; ')}.`;

      return {
        transcript,
        responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (weatherPlaceQuery !== null) {
      try {
        const weatherResult = await this.weatherService.getWeather(weatherPlaceQuery);

        return {
          transcript,
          responseText: weatherResult.responseText,
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      } catch {
        return {
          transcript,
          responseText: 'Palun ütle linn või koht, näiteks mis ilm Calpes on.',
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      }
    }

    if (calculatorExpression !== null) {
      try {
        const calcResult = this.calculatorService.evaluate(calculatorExpression);

        return {
          transcript,
          responseText: calcResult.responseText,
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      } catch {
        return {
          transcript,
          responseText: 'Palun ütle lihtne arvutus, näiteks 2 pluss 2 või 10 korda 5.',
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      }
    }

    if (
      normalized === 'mis kuupäev täna on' ||
      normalized === 'mis kuupäev on' ||
      normalized === 'mis päev täna on' ||
      normalized === 'ütle kuupäev' ||
      normalized === 'ütle tänane kuupäev'
    ) {
      const dateResult = this.timeService.getToday();

      return {
        transcript,
        responseText: dateResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (
      normalized === 'mis kell on' ||
      normalized === 'mis aeg on' ||
      normalized === 'ütle kellaaeg' ||
      normalized === 'ütle aeg'
    ) {
      const timeResult = this.timeService.getNow();

      return {
        transcript,
        responseText: timeResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (normalized === 'kas mul on täna veel midagi' || normalized === 'kas mul on täna midagi veel') {
      const calendarResult = await this.calendarService.listTodayEvents(20);

      if (calendarResult.status !== 'ready') {
        return {
          transcript,
          responseText: calendarResult.responseText,
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      }

      if (calendarResult.events.length === 0) {
        return {
          transcript,
          responseText: 'Sul ei ole täna enam ühtegi sündmust.',
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      }

      const remaining = calendarResult.events
        .slice(0, 5)
        .map((event) => `${event.startText} ${event.summary}`)
        .join('; ');

      return {
        transcript,
        responseText: `Jah, sul on täna veel: ${remaining}.`,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (
      normalized === 'mis mul täna kalendris on' ||
      normalized === 'näita tänased sündmused' ||
      normalized === 'näita tänaseid sündmusi' ||
      normalized === 'näita tänast kalendrit' ||
      normalized === 'mis on täna kalendris'
    ) {
      const calendarResult = await this.calendarService.listTodayEvents(20);

      const responseText = this.buildTodayCalendarVoiceSummary(calendarResult.responseText);
      const speechText = this.buildTodayCalendarSpeechSummary(calendarResult.responseText);

      return {
        transcript,
        responseText,
        displayText: responseText,
        speechText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (normalized === 'mis mul täna on') {
      const calendarResult = await this.calendarService.listAllTodayEvents(20);

      if (calendarResult.status !== 'ready') {
        return {
          transcript,
          responseText: calendarResult.responseText,
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      }

      if (calendarResult.events.length === 0) {
        return {
          transcript,
          responseText: 'Sul ei ole täna ühtegi sündmust.',
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      }

      const items = calendarResult.events
        .slice(0, 10)
        .map((event) => `${event.startText} ${event.summary}`)
        .join('; ');

      const responseText = `Täna on sul: ${items}.`;
      const speechText = this.buildTodayCalendarSpeechSummary(`Tänased kalendrisündmused: ${items}.`);

      return {
        transcript,
        responseText,
        displayText: responseText,
        speechText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (normalized === 'näita kalendrit' || normalized === 'näita järgmisi kalendrisündmusi') {
      const calendarResult = await this.calendarService.listUpcomingEvents(10);

      const responseText = this.buildCalendarVoiceSummary(calendarResult.responseText);
      const speechText = this.buildCalendarSpeechSummary(calendarResult.responseText);

      return {
        transcript,
        responseText,
        displayText: responseText,
        speechText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (calendarCreateCommand !== null) {
      if (
        !calendarCreateCommand.title ||
        !calendarCreateCommand.start ||
        !calendarCreateCommand.end ||
        calendarCreateCommand.parseFailed
      ) {
        return {
          transcript,
          responseText:
            'Palun ütle kalendrikäsk kujul: lisa kalendrisse homme kell 12 kuni 13 pealkiri.',
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      }

      const createResult = await this.calendarService.createEvent({
        title: calendarCreateCommand.title,
        start: calendarCreateCommand.start,
        end: calendarCreateCommand.end,
      });

      return {
        transcript,
        responseText: createResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (calendarUpdateCommand !== null) {
      if (
        !calendarUpdateCommand.title ||
        !calendarUpdateCommand.start ||
        !calendarUpdateCommand.end ||
        calendarUpdateCommand.parseFailed
      ) {
        return {
          transcript,
          responseText:
            'Palun ütle käsk kujul: muuda kalendris pealkiri homme kell 14 kuni 15.',
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      }

      const updateResult = await this.calendarService.updateUpcomingEventByTitle({
        titleQuery: calendarUpdateCommand.title,
        start: calendarUpdateCommand.start,
        end: calendarUpdateCommand.end,
      });

      return {
        transcript,
        responseText: updateResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (calendarDeleteTitle !== null) {
      if (!calendarDeleteTitle) {
        return {
          transcript,
          responseText: 'Palun ütle kustutatava kalendrisündmuse nimi pärast sõnu kustuta kalendrist.',
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      }

      const deleteResult = await this.calendarService.deleteUpcomingEventByTitle(calendarDeleteTitle);

      return {
        transcript,
        responseText: deleteResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (normalized === 'näita kontaktid' || normalized === 'näita contacts' || normalized === 'näita google kontaktid') {
      const contactsResult = await this.contactsService.listContacts(20);

      return {
        transcript,
        responseText: this.buildContactsVoiceSummary(contactsResult.responseText),
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }


    if (contactSearchQuery !== null) {
      const contactsResult = await this.contactsService.searchContacts(contactSearchQuery, 10);

      return {
        transcript,
        responseText: contactsResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }
    if (
      normalized === 'loe gmaili' ||
      normalized === 'näita gmaili' ||
      normalized === 'näita kirju' ||
      normalized === 'näita viimaseid kirju'
    ) {
      const gmailResult = await this.gmailService.listLatestMessages();
      const responseText = this.buildGmailVoiceSummary(gmailResult.responseText);
      const speechText = this.buildGmailSpeechSummary(gmailResult.responseText);

      return {
        transcript,
        responseText,
        displayText: responseText,
        speechText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (gmailLatestCount !== null) {
      const gmailResult = await this.gmailService.listLatestMessagesForSearchContext(
        gmailLatestCount,
        gmailLatestCount,
      );

      return {
        transcript,
        responseText: gmailResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (wantsUnreadList) {
      const gmailResult = await this.gmailService.listUnreadMessages();

      return {
        transcript,
        responseText: gmailResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (gmailSenderSearch !== null) {
      const gmailResult = await this.gmailService.searchMessagesBySender(gmailSenderSearch);

      return {
        transcript,
        responseText: gmailResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (gmailSubjectSearch !== null) {
      const gmailResult = await this.gmailService.searchMessagesBySubject(gmailSubjectSearch);

      return {
        transcript,
        responseText: gmailResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (gmailReadLatestBySender !== null) {
      const gmailResult = await this.gmailService.readLatestMessageBySender(gmailReadLatestBySender);

      return {
        transcript,
        responseText: gmailResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (gmailReadLatestBySubject !== null) {
      const gmailResult = await this.gmailService.readLatestMessageBySubject(gmailReadLatestBySubject);

      return {
        transcript,
        responseText: gmailResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (gmailReadFoundPosition !== null) {
      const gmailResult = await this.gmailService.readMessageFromSearchResults(gmailReadFoundPosition);

      return {
        transcript,
        responseText: gmailResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (wantsUnreadReadLatest) {
      const gmailResult = await this.gmailService.readLatestUnreadMessage();

      return {
        transcript,
        responseText: gmailResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (normalized === 'loe viimane kiri') {
      const gmailResult = await this.gmailService.readMessageByPosition('last');

      return {
        transcript,
        responseText: gmailResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (gmailReadPosition !== null) {
      const gmailResult = await this.gmailService.readMessageByPosition(gmailReadPosition);

      return {
        transcript,
        responseText: gmailResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (gmailSenderCount !== null) {
      const gmailResult = await this.gmailService.countMessagesBySender(gmailSenderCount);

      return {
        transcript,
        responseText: gmailResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (gmailSubjectCount !== null) {
      const gmailResult = await this.gmailService.countMessagesBySubject(gmailSubjectCount);

      return {
        transcript,
        responseText: gmailResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (wantsUnreadCount) {
      const gmailResult = await this.gmailService.countUnreadMessages();

      return {
        transcript,
        responseText: gmailResult.responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (
      normalized === 'kontrolli jarvise seisu' ||
      normalized === 'anna süsteemi üldraport' ||
      normalized === 'anna lühike süsteemi üldraport' ||
      normalized === 'anna süsteemi raport' ||
      normalized === 'anna lühike süsteemi raport' ||
      normalized === 'süsteemi üldraport' ||
      normalized === 'süsteemi raport'
    ) {
      const responseText = await this.fetchJarvisStatusSummary();

      return {
        transcript,
        responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (
      normalized === 'anna tänane seis' ||
      normalized === 'anna tänase päeva seis' ||
      normalized === 'tänane seis' ||
      normalized === 'anna tänane status' ||
      normalized === 'tänane status'
    ) {
      const responseText = await this.fetchTodayCompactStatusSummary();

      return {
        transcript,
        responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (normalized === 'näita terminali logi') {
      const responseText = await this.fetchTerminalLogText();

      return {
        transcript,
        responseText,
        locale: 'et-EE',
        inputMode: input.source,
        outputMode: 'text',
        status: 'speaking',
      };
    }

    if (normalized.startsWith('märgi meeldetuletus tehtuks')) {
      const rawId = transcript.replace(/^märgi meeldetuletus tehtuks[:\s-]*/i, '').trim();

      if (!rawId) {
        return {
          transcript,
          responseText: 'Palun ütle meeldetuletuse number pärast sõnu märgi meeldetuletus tehtuks.',
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      }

      if (!/^\d+$/.test(rawId)) {
        return {
          transcript,
          responseText: 'Palun ütle kehtiv numbriline meeldetuletuse id.',
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      }

      try {
        const reminder = this.remindersService.markDone(Number(rawId));

        return {
          transcript,
          responseText: `Märkisin meeldetuletuse ${reminder.id} tehtuks.`,
          locale: 'et-EE',
          inputMode: input.source,
          outputMode: 'text',
          status: 'speaking',
        };
      } catch (error) {
        if (error instanceof AppError && error.code === 'REMINDER_NOT_FOUND') {
          return {
            transcript,
            responseText: `Ma ei leidnud meeldetuletust numbriga ${rawId}.`,
            locale: 'et-EE',
            inputMode: input.source,
            outputMode: 'text',
            status: 'speaking',
          };
        }

        throw error;
      }
    }

    const startedAt = Date.now();

    const result = await this.voiceAssistantProvider.respond({
      ...input,
      locale: 'et-EE',
    });

    logger.info(
      {
        operation: 'voice.fallback',
        durationMs: Date.now() - startedAt,
        transcript,
      },
      'Voice fallback used',
    );

    return result;
  }


  private buildGmailVoiceSummary(responseText: string): string {
    const compact = responseText.replace(/^Viimased Gmaili kirjad:\s*/i, '').trim();

    const items = compact
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((item) => item.replace(/\s*\([^)]*\)\s*$/u, '').trim());

    if (items.length === 0) {
      return 'Viimased Gmaili kirjad on saadaval.';
    }

    const cleanedItems = items.map((item) =>
      item
        .replace(/[€$£¥]/g, '')
        .replace(/[⏳⌛📩📧📨]/g, '')
        .replace(/EADDRINUSE/gi, 'port on juba kasutuses')
        .replace(/address already in use/gi, 'aadress on juba kasutuses')
        .replace(/NODE-EXPRESS-?\d*/gi, 'Node Express')
        .replace(/\s+-\s+Error:\s+/gi, ' - ')
        .replace(/:{2,}\d+/g, '')
        .replace(/\b\d{4,}\b/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[.;:!]+$/g, '')
        .trim()
    );

    return `Viimased Gmaili kirjad on: ${cleanedItems.join('; ')}.`;
  }

  private buildGmailSpeechSummary(responseText: string): string {
    const compact = responseText.replace(/^Viimased Gmaili kirjad:\s*/i, '').trim();

    const items = compact
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((item) => item.replace(/\s*\([^)]*\)\s*$/u, '').trim());

    if (items.length === 0) {
      return 'Viimased Gmaili kirjad on saadaval.';
    }

    const cleanedItems = items.map((item) =>
      item
        .replace(/[€$£¥]/g, '')
        .replace(/[⏳⌛📩📧📨]/g, '')
        .replace(/EADDRINUSE/gi, 'port on juba kasutuses')
        .replace(/address already in use/gi, 'aadress on juba kasutuses')
        .replace(/NODE-EXPRESS-?\d*/gi, 'Node Express')
        .replace(/:{2,}\d+/g, '')
        .replace(/\b\d{4,}\b/g, '')
        .replace(/\s+-\s+Error:\s+/gi, ' - ')
        .replace(/\s+/g, ' ')
        .replace(/[.;:!]+$/g, '')
        .trim()
    );

    return `Viimased Gmaili kirjad on: ${cleanedItems.join('; ')}.`;
  }

  private buildCalendarVoiceSummary(responseText: string): string {
    const compact = responseText.replace(/^Järgmised kalendrisündmused:\s*/i, '').trim();

    const items = compact
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((item) => item.replace(/\.$/, '').trim());

    if (items.length === 0) {
      return 'Järgmised kalendrisündmused on saadaval.';
    }

    const simplifiedItems = items.map((item) =>
      item
        .replace(/,\s*kell\s+/giu, ' kell ')
        .replace(/\s+/g, ' ')
        .trim()
    );

    return `Järgmised kalendrisündmused on: ${simplifiedItems.join('; ')}.`;
  }

  private buildCalendarSpeechSummary(responseText: string): string {
    const compact = responseText.replace(/^Järgmised kalendrisündmused:\s*/i, '').trim();

    const items = compact
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((item) =>
        item
          .replace(/\(([^)]*)\)/g, '')
          .replace(/,\s*kell\s+/giu, ' kell ')
          .replace(/20:50/g, 'kakskümmend … viiskümmend')
          .replace(/07:00/g, 'seitse … null null')
          .replace(/2026/g, 'kaks tuhat kakskümmend kuus')
          .replace(/17\./g, 'seitseteist')
          .replace(/24\./g, 'kakskümmend neli')
          .replace(/12\./g, 'kaksteist')
          .replace(/:/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );

    if (items.length === 0) {
      return 'Järgmised kalendrisündmused on saadaval.';
    }

    return `Järgmised kalendrisündmused on: ${items.join('; ')}.`;
  }

  private buildTodayCalendarVoiceSummary(responseText: string): string {
    const compact = responseText.replace(/^Tänased kalendrisündmused:\s*/i, '').trim();

    const items = compact
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((item) => item.replace(/\.$/, '').trim());

    if (items.length === 0) {
      return responseText;
    }

    const simplifiedItems = items.map((item) =>
      item
        .replace(/,\s*kell\s+/giu, ' kell ')
        .replace(/\s+/g, ' ')
        .trim()
    );

    return `Tänased kalendrisündmused on: ${simplifiedItems.join('; ')}.`;
  }

  private buildTodayCalendarSpeechSummary(responseText: string): string {
    const compact = responseText.replace(/^Tänased kalendrisündmused:\s*/i, '').trim();

    const items = compact
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((item) =>
        item
          .replace(/\(([^)]*)\)/g, '')
          .replace(/,\s*kell\s+/giu, ' kell ')
          .replace(/:/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );

    if (items.length === 0) {
      return responseText;
    }

    return `Tänased kalendrisündmused on: ${items.join('; ')}.`;
  }

  private buildContactsVoiceSummary(responseText: string): string {
    const match = responseText.match(/^Leidsin\s+(\d+)\s+kontakti:\s*(.*)$/iu);

    if (!match) {
      return 'Kontaktid on saadaval.';
    }

    const total = match[1];
    const rawList = match[2] ?? '';

    const names = rawList
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (item.split('|')[0] ?? '').trim())
      .map((item) => item.replace(/^((HHH|PPP|QQQ|KVR|PLL|LLL|BBB|MAA|III|KZB|vvv|Te)\s+)+/u, ''))
      .filter(Boolean)
      .slice(0, 5);

    if (names.length === 0) {
      return `Leidsin ${total} kontakti.`;
    }

    return `Leidsin ${total} kontakti. Esimesed kontaktid on: ${names.join('; ')}.`;
  }

  private parseContactSearchQuery(transcript: string): string | null {
    const match = transcript.match(/^otsi kontakt[:\s-]+(.+)$/i);

    if (!match) {
      return null;
    }

    return match[1].trim();
  }

  private parseGmailReadPosition(transcript: string): number | null {
    const normalizedTranscript = this.normalizeEstonianText(transcript);
    const ordinalMap: Record<string, number> = {
      esimene: 1,
      teine: 2,
      kolmas: 3,
      neljas: 4,
      viies: 5,
      kuues: 6,
      seitsmes: 7,
      kaheksas: 8,
      üheksas: 9,
      uheksas: 9,
      kümnes: 10,
      kumnes: 10,
    };
    const ordinalPattern = Object.keys(ordinalMap).join('|');

    const directOrdinalMatch = normalizedTranscript.match(new RegExp(`^loe\\s+(${ordinalPattern})\\s+kiri$`));

    if (directOrdinalMatch) {
      return ordinalMap[directOrdinalMatch[1]];
    }

    const numberedForms = [
      /^loe\s+kiri\s+number\s+(\d+)$/,
      /^loe\s+(\d+)\s+kiri$/,
    ];

    for (const pattern of numberedForms) {
      const match = normalizedTranscript.match(pattern);

      if (match) {
        const parsedNumber = Number(match[1]);
        return Number.isInteger(parsedNumber) && parsedNumber > 0 ? parsedNumber : null;
      }
    }

    return null;
  }

  private parseGmailLatestCount(transcript: string): number | null {
    const normalizedTranscript = this.normalizeEstonianText(transcript);
    const match = normalizedTranscript.match(/^näita\s+(\d+)\s+viimast\s+kirja$/);

    if (!match) {
      return null;
    }

    const parsedNumber = Number(match[1]);
    return Number.isInteger(parsedNumber) && parsedNumber > 0 ? parsedNumber : null;
  }

  private parseGmailSenderSearch(transcript: string): string | null {
    return this.extractTrailingValue(transcript, [
      /^otsi kiri saatjalt\s+(.+)$/iu,
      /^otsi kirju saatjalt\s+(.+)$/iu,
      /^näita kirjad saatjalt\s+(.+)$/iu,
    ]);
  }

  private parseGmailSubjectSearch(transcript: string): string | null {
    return this.extractTrailingValue(transcript, [
      /^otsi kiri teemaga\s+(.+)$/iu,
      /^otsi kirju teemaga\s+(.+)$/iu,
      /^näita kirjad teemaga\s+(.+)$/iu,
    ]);
  }

  private parseGmailReadFoundPosition(transcript: string): number | 'last' | null {
    const normalizedTranscript = this.normalizeEstonianText(transcript);
    const ordinalMap: Record<string, number> = {
      esimene: 1,
      teine: 2,
      kolmas: 3,
    };
    const directOrdinalMatch = normalizedTranscript.match(/^loe\s+(esimene|teine|kolmas)\s+leitud\s+kiri$/);

    if (directOrdinalMatch) {
      return ordinalMap[directOrdinalMatch[1]];
    }

    if (normalizedTranscript === 'loe viimane leitud kiri') {
      return 'last';
    }

    return null;
  }

  private parseGmailReadLatestBySender(transcript: string): string | null {
    return this.extractTrailingValue(transcript, [/^loe viimane kiri saatjalt\s+(.+)$/iu]);
  }

  private parseGmailReadLatestBySubject(transcript: string): string | null {
    return this.extractTrailingValue(transcript, [/^loe viimane kiri teemaga\s+(.+)$/iu]);
  }

  private parseGmailSenderCount(transcript: string): string | null {
    return this.extractTrailingValue(transcript, [/^mitu kirja saatjalt\s+(.+)$/iu]);
  }

  private parseGmailSubjectCount(transcript: string): string | null {
    return this.extractTrailingValue(transcript, [/^mitu kirja teemaga\s+(.+)$/iu]);
  }

  private isGmailUnreadListCommand(normalizedTranscript: string) {
    return normalizedTranscript === 'näita lugemata kirjad';
  }

  private extractTrailingValue(transcript: string, patterns: RegExp[]) {
    const compactTranscript = transcript.trim().replace(/\s+/g, ' ');

    for (const pattern of patterns) {
      const match = compactTranscript.match(pattern);
      const value = match?.[1]?.trim();

      if (value) {
        return value;
      }
    }

    return null;
  }

  private normalizeEstonianText(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }


  private parseCalculatorExpression(transcript: string): string | null {
    const normalizedTranscript = this.normalizeEstonianText(transcript);

    const patterns = [
      /^mis on\s+(.+)$/,
      /^arvuta\s+(.+)$/,
      /^kalkuleeri\s+(.+)$/,
    ];

    for (const pattern of patterns) {
      const match = normalizedTranscript.match(pattern);

      if (match) {
        return match[1]
          .replace(/ pluss /g, ' + ')
          .replace(/ miinus /g, ' - ')
          .replace(/ korda /g, ' * ')
          .replace(/ jagatud /g, ' / ')
          .trim();
      }
    }

    return null;
  }

  private parseWeatherPlaceQuery(transcript: string): string | null {
    const normalizedTranscript = this.normalizeEstonianText(transcript);

    const patterns = [
      /^mis ilm\s+(.+)\s+on$/,
      /^milline ilm\s+(.+)\s+on$/,
      /^näita ilma\s+(.+)$/,
      /^mis ilm on\s+(.+)$/,
    ];

    for (const pattern of patterns) {
      const match = normalizedTranscript.match(pattern);

      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  private async fetchTerminalLogText(): Promise<string> {
    return new Promise((resolve) => {
      const request = http.get('http://localhost:3000/api/debug/logs/text', (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          if (!data.trim()) {
            resolve('Terminali logi on tühi.');
            return;
          }

          const cleaned = data
            .replace(/\s+/g, ' ')
            .replace(/===== BACKEND LOGI =====/g, ' BACKEND LOGI. ')
            .replace(/===== WATCHER LOGI =====/g, ' WATCHER LOGI. ')
            .replace(/===== LÕPP =====/g, ' LÕPP. ')
            .trim();

          resolve(cleaned.slice(0, 4000));
        });
      });

      request.on('error', () => {
        resolve('Terminali logi ei õnnestunud lugeda.');
      });

      request.end();
    });
  }



  private async fetchJarvisStatusSummary(): Promise<string> {
    return new Promise((resolve) => {
      const healthRequest = http.get('http://localhost:3000/health', (healthResponse) => {
        let healthData = '';

        healthResponse.on('data', (chunk) => {
          healthData += chunk;
        });

        healthResponse.on('end', () => {
          let backendOk = false;

          try {
            const parsed = JSON.parse(healthData) as { status?: string };
            backendOk = parsed.status === 'ok';
          } catch {
            backendOk = false;
          }

          const controlRequest = http.get('http://localhost:3000/api/debug/control-summary-compact', (controlResponse) => {
            let controlData = '';

            controlResponse.on('data', (chunk) => {
              controlData += chunk;
            });

            controlResponse.on('end', () => {
              try {
                const parsed = JSON.parse(controlData) as {
                  ok?: boolean;
                  summary?: {
                    terminalStage?: string | null;
                    terminalStatus?: string | null;
                    executionStatus?: string | null;
                    executionStep?: number | null;
                    executionTotalSteps?: number | null;
                    pendingId?: string | null;
                    pendingRequestId?: string | null;
                    pendingStatus?: string | null;
                    currentPwd?: string | null;
                    currentExitCode?: number | null;
                  };
                };

                const summary = parsed.summary ?? {};

                const terminalStatus = summary.terminalStatus ?? 'teadmata';
                const executionStatus = summary.executionStatus ?? 'teadmata';
                const executionStep = summary.executionStep;
                const executionTotalSteps = summary.executionTotalSteps;
                const pendingRequestId = summary.pendingRequestId ?? null;
                const pendingStatus = summary.pendingStatus ?? null;

                const stepText =
                  typeof executionStep === 'number' && typeof executionTotalSteps === 'number'
                    ? `execution ${executionStep}/${executionTotalSteps}`
                    : 'execution teadmata';

                const pendingText = pendingRequestId
                  ? `ootel kinnitus ${pendingRequestId}${pendingStatus ? ` (${pendingStatus})` : ''}`
                  : 'ootel kinnitusi ei ole';

                let recommendation = 'Soovitus: süsteem on stabiilne, järgmine samm on smart status käsu lihvimine.';

                if (!backendOk) {
                  recommendation = 'Soovitus: taaskäivita Jarvis ja kontrolli health endpointi.';
                } else if (pendingRequestId) {
                  recommendation = 'Soovitus: lõpeta või kinnita ootel käsk enne järgmist sammu.';
                } else if (terminalStatus !== 'completed') {
                  recommendation = 'Soovitus: lõpeta aktiivne terminali samm enne uut käsku.';
                } else if (executionStatus !== 'completed') {
                  recommendation = 'Soovitus: lõpeta käimasolev execution-plokk enne uut haru.';
                }

                resolve(
                  `Jarvise seis: ${backendOk ? 'backend töötab' : 'backend ei vasta'}, terminal ${terminalStatus}, ${stepText}, ${pendingText}. ${recommendation}`,
                );
              } catch {
                resolve(
                  `Jarvise seis: ${backendOk ? 'backend töötab' : 'backend ei vasta'}. Soovitus: control summary vastust ei õnnestunud lugeda.`,
                );
              }
            });
          });

          controlRequest.on('error', () => {
            resolve(
              `Jarvise seis: ${backendOk ? 'backend töötab' : 'backend ei vasta'}. Soovitus: control summary endpoint ei vastanud.`,
            );
          });

          controlRequest.end();
        });
      });

      healthRequest.on('error', () => {
        resolve('Jarvise seis: backend ei vasta. Soovitus: taaskäivita Jarvis ja kontrolli health endpointi.');
      });

      healthRequest.end();
    });
  }

  private async fetchTodayCompactStatusSummary(): Promise<string> {
    const [backendOk, pendingConfirmations, calendarHasEvents] = await Promise.all([
      this.fetchBackendOk(),
      this.fetchPendingConfirmations(),
      this.fetchTodayCalendarHasEvents(),
    ]);

    const backendText = backendOk === true ? 'backend töötab' : backendOk === false ? 'backend maas' : 'backend teadmata';
    const calendarText =
      calendarHasEvents === true
        ? 'täna on sündmusi'
        : calendarHasEvents === false
          ? 'täna sündmusi ei ole'
          : 'kalender teadmata';
    const confirmationsText =
      pendingConfirmations === true
        ? 'ootel kinnitusi on'
        : pendingConfirmations === false
          ? 'ootel kinnitusi ei ole'
          : 'kinnitused teadmata';

    return `Tänane seis: ${backendText}; ${calendarText}; ${confirmationsText}.`;
  }

  private async fetchBackendOk(): Promise<boolean | null> {
    return new Promise((resolve) => {
      const request = http.get('http://localhost:3000/health', (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const parsed = JSON.parse(data) as { status?: string };
            resolve(parsed.status === 'ok');
          } catch {
            resolve(null);
          }
        });
      });

      request.on('error', () => resolve(false));
      request.end();
    });
  }

  private async fetchPendingConfirmations(): Promise<boolean | null> {
    return new Promise((resolve) => {
      const request = http.get('http://localhost:3000/api/debug/control-summary-compact', (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const parsed = JSON.parse(data) as {
              ok?: boolean;
              summary?: { pendingRequestId?: string | null };
            };

            const pendingRequestId = parsed.summary?.pendingRequestId ?? null;
            resolve(Boolean(pendingRequestId));
          } catch {
            resolve(null);
          }
        });
      });

      request.on('error', () => resolve(false));
      request.end();
    });
  }

  private async fetchTodayCalendarHasEvents(): Promise<boolean | null> {
    try {
      const calendarResult = await this.calendarService.listTodayEvents(1);
      if (calendarResult.status !== 'ready') return null;
      return calendarResult.events.length > 0;
    } catch {
      return null;
    }
  }

}
