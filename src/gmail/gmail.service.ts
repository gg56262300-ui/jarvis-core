import fs from 'node:fs/promises';
import path from 'node:path';

import type { GaxiosError } from 'gaxios';
import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import type { Credentials } from 'google-auth-library';

import { env } from '../config/index.js';
import { resolveGmailStyleRedirectUri } from '../shared/google-oauth/gmail-redirect.js';
import { AppError } from '../shared/errors/app-error.js';
import { logger } from '../shared/logger/logger.js';

export interface GmailAuthorizationRequiredResult {
  status: 'authorization_required';
  responseText: string;
  authUrl: string;
  tokenPath: string;
}

export interface GmailMessagesReadyResult {
  status: 'ready';
  responseText: string;
  messages: Array<{
    id: string;
    from: string;
    subject: string;
    date: string;
    snippet: string;
  }>;
}

export interface GmailMessageReadReadyResult {
  status: 'ready';
  responseText: string;
  message: {
    id: string;
    from: string;
    subject: string;
    date: string;
    snippet: string;
  } | null;
}

export type GmailInboxResult =
  | GmailAuthorizationRequiredResult
  | GmailMessagesReadyResult;

export type GmailReadResult =
  | GmailAuthorizationRequiredResult
  | GmailMessageReadReadyResult;

export interface GmailMessageDetailReadyResult {
  status: 'ready';
  message: {
    id: string;
    from: string;
    subject: string;
    date: string;
    snippet: string;
    text?: string;
  };
}

export type GmailMessageByIdResult = GmailAuthorizationRequiredResult | GmailMessageDetailReadyResult;

export interface GmailSendTestReadyResult {
  status: 'sent';
  id: string;
  responseText: string;
}

export type GmailSendTestResult = GmailAuthorizationRequiredResult | GmailSendTestReadyResult;

type GmailMessageSummary = GmailMessagesReadyResult['messages'][number];
type AuthorizedClientResult =
  | {
      status: 'authorized';
      client: InstanceType<typeof google.auth.OAuth2>;
    }
  | {
      status: 'authorization_required';
      result: GmailAuthorizationRequiredResult;
    };

export class GmailService {
  private readonly tokenPath = path.resolve(process.cwd(), 'data/google-gmail-token.json');
  private readonly scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
  ];
  private recentMessagesCache: GmailMessageSummary[] = [];
  private searchResultsCache: GmailMessageSummary[] = [];

  async getAuthorizationUrl() {
    const client = await this.createOAuthClient();

    if (!client) {
      return this.buildConfigurationRequiredResult();
    }

    return {
      authUrl: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: this.scopes,
      }),
      tokenPath: this.tokenPath,
      instructions:
        'Ava see link brauseris, logi Google kontoga sisse ja kleebi tagasi saadud code väärtus POST /api/gmail/google/authorize päringusse.',
    };
  }

  async completeAuthorization(code: string) {
    const client = await this.createOAuthClient();

    if (!client) {
      return this.buildConfigurationRequiredResult();
    }

    let tokens: Credentials;

    try {
      const startedAt = Date.now();
      const tokenResponse = await client.getToken(code.trim());
      logger.info(
        {
          provider: 'google',
          operation: 'gmail.oauth.getToken',
          durationMs: Date.now() - startedAt,
        },
        'External API latency',
      );
      tokens = tokenResponse.tokens;
    } catch (error) {
      throw this.toGoogleAuthorizationError(error);
    }

    await this.saveToken(tokens);

    return {
      status: 'authorized' as const,
      responseText: 'Gmail on nüüd kohalikus arenduses autoriseeritud.',
      tokenPath: this.tokenPath,
    };
  }

  async getMessageById(messageId: string): Promise<GmailMessageByIdResult> {
    const id = messageId.trim();
    if (!id) {
      throw new AppError('Sõnumi id puudub.', 400, 'GMAIL_MESSAGE_ID_REQUIRED');
    }

    const authorizedClient = await this.getAuthorizedClient();

    if (authorizedClient.status === 'authorization_required') {
      return authorizedClient.result;
    }

    try {
      const gmailApi = google.gmail({
        version: 'v1',
        auth: authorizedClient.client,
      });

      const startedAt = Date.now();
      const messageResponse = await gmailApi.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      });
      logger.info(
        {
          provider: 'google',
          operation: 'gmail.users.messages.get',
          durationMs: Date.now() - startedAt,
        },
        'External API latency',
      );

      const headers = messageResponse.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value?.trim() || '';

      const text = extractPlainTextFromPayload(messageResponse.data.payload);

      return {
        status: 'ready',
        message: {
          id: messageResponse.data.id ?? id,
          from: getHeader('From') || 'Saatja puudub',
          subject: getHeader('Subject') || 'Teema puudub',
          date: getHeader('Date') || 'Kuupäev puudub',
          snippet: messageResponse.data.snippet?.trim() || '',
          ...(text ? { text } : {}),
        },
      };
    } catch (error) {
      const gaxiosError = error as GaxiosError<{ error?: { code?: number; message?: string } }>;
      if (gaxiosError.response?.status === 404) {
        throw new AppError('Sõnumit ei leitud.', 404, 'GMAIL_MESSAGE_NOT_FOUND');
      }
      logger.warn({ err: error }, 'Gmail message by id request failed');
      return this.buildAuthorizationRequiredResult(authorizedClient.client);
    }
  }

  async sendTestMessage(to: string, subject: string, textBody: string): Promise<GmailSendTestResult> {
    const toTrim = to.trim();
    const subjectTrim = subject.trim();
    const textTrim = textBody.trim();

    if (!toTrim || !subjectTrim || !textTrim) {
      throw new AppError('Palun saada to, subject ja text väljad.', 400, 'GMAIL_SEND_TEST_INVALID_BODY');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(toTrim)) {
      throw new AppError('Vigane e-posti aadress väljal to.', 400, 'GMAIL_SEND_TEST_INVALID_TO');
    }

    const authorizedClient = await this.getAuthorizedClient();

    if (authorizedClient.status === 'authorization_required') {
      return authorizedClient.result;
    }

    try {
      const gmailApi = google.gmail({
        version: 'v1',
        auth: authorizedClient.client,
      });

      const raw = buildRfc822PlainText(toTrim, subjectTrim, textTrim);
      const encoded = Buffer.from(raw, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/u, '');

      const startedAt = Date.now();
      const sendResponse = await gmailApi.users.messages.send({
        userId: 'me',
        requestBody: { raw: encoded },
      });
      logger.info(
        {
          provider: 'google',
          operation: 'gmail.users.messages.send',
          durationMs: Date.now() - startedAt,
        },
        'External API latency',
      );

      const sentId = sendResponse.data.id ?? '';

      return {
        status: 'sent',
        id: sentId,
        responseText: sentId ? `Testkiri saadetud (id: ${sentId}).` : 'Testkiri saadetud.',
      };
    } catch (error) {
      logger.warn({ err: error }, 'Gmail send test failed');
      return this.buildAuthorizationRequiredResult(authorizedClient.client);
    }
  }

  async listLatestMessages(limit = 10, summaryCount = Math.min(limit, 5)): Promise<GmailInboxResult> {
    const authorizedClient = await this.getAuthorizedClient();

    if (authorizedClient.status === 'authorization_required') {
      this.recentMessagesCache = [];
      return authorizedClient.result;
    }

    try {
      const startedAt = Date.now();
      const messages = await this.fetchLatestMessages(authorizedClient.client, limit);
      logger.info(
        {
          provider: 'google',
          operation: 'gmail.fetchLatestMessages',
          durationMs: Date.now() - startedAt,
          limit,
        },
        'External API latency',
      );
      this.recentMessagesCache = messages;

      if (messages.length === 0) {
        return {
          status: 'ready',
          responseText: 'Postkastis ei ole praegu ühtegi kirja.',
          messages,
        };
      }

      return {
        status: 'ready',
        responseText: this.buildMessagesSummaryText(
          messages,
          limit >= 10 && summaryCount >= 10 ? `Viimased ${Math.min(limit, messages.length)} Gmaili kirja` : 'Viimased Gmaili kirjad',
          summaryCount,
        ),
        messages,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Gmail messages request failed');
      this.recentMessagesCache = [];
      return this.buildAuthorizationRequiredResult(authorizedClient.client);
    }
  }

  async listLatestMessagesForSearchContext(
    limit: number,
    summaryCount = Math.min(limit, 5),
  ): Promise<GmailInboxResult> {
    const result = await this.listLatestMessages(limit, summaryCount);

    if (result.status === 'ready') {
      this.searchResultsCache = result.messages;
    }

    return result;
  }

  async readMessageByPosition(position: 'last', limit?: number): Promise<GmailReadResult>;
  async readMessageByPosition(position: number, limit?: number): Promise<GmailReadResult>;
  async readMessageByPosition(position: number | 'last', limit = 10): Promise<GmailReadResult> {
    const authorizedClient = await this.getAuthorizedClient();

    if (authorizedClient.status === 'authorization_required') {
      this.recentMessagesCache = [];
      return authorizedClient.result;
    }

    try {
      const messages =
        this.recentMessagesCache.length > 0
          ? this.recentMessagesCache
          : await this.fetchLatestMessages(authorizedClient.client, limit);

      this.recentMessagesCache = messages;

      if (messages.length === 0) {
        return {
          status: 'ready',
          responseText: 'Postkastis ei ole praegu ühtegi kirja.',
          message: null,
        };
      }

      const selectedIndex = position === 'last' ? 0 : position - 1;

      if (selectedIndex < 0 || selectedIndex >= messages.length) {
        const requestedLabel =
          position === 'last' ? 'viimast' : `${this.formatPositionLabel(position)} (${position}.)`;

        return {
          status: 'ready',
          responseText: `Postkastis ei ole praegu ${requestedLabel} kirja, mida ette lugeda. Näha on ${messages.length} viimast kirja.`,
          message: null,
        };
      }

      const message = messages[selectedIndex];
      const ordinalText = position === 'last' ? 'viimane' : this.formatPositionLabel(position);
      const snippetText = message.snippet ? ` Sisu algus: ${message.snippet}.` : '';

      return {
        status: 'ready',
        responseText: `Siin on ${ordinalText} kiri. Teema: ${message.subject}. Saatja: ${message.from}. Kuupäev: ${message.date}.${snippetText}`,
        message,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Gmail message read request failed');
      this.recentMessagesCache = [];
      return this.buildAuthorizationRequiredResult(authorizedClient.client);
    }
  }

  async searchMessagesBySender(senderQuery: string, limit = 10): Promise<GmailInboxResult> {
    return this.searchMessages({
      label: `Leidsin kirjad saatjalt ${senderQuery}`,
      emptyResponseText: `Ma ei leidnud postkastist ühtegi kirja saatjalt ${senderQuery}.`,
      limit,
      query: `in:inbox from:"${this.escapeGmailQueryValue(senderQuery)}"`,
    });
  }

  async searchMessagesBySubject(subjectQuery: string, limit = 10): Promise<GmailInboxResult> {
    return this.searchMessages({
      label: `Leidsin kirjad teemaga ${subjectQuery}`,
      emptyResponseText: `Ma ei leidnud postkastist ühtegi kirja teemaga ${subjectQuery}.`,
      limit,
      query: `in:inbox subject:"${this.escapeGmailQueryValue(subjectQuery)}"`,
    });
  }

  async readLatestMessageBySender(senderQuery: string): Promise<GmailReadResult> {
    return this.readLatestMatchingMessage({
      emptyResponseText: `Ma ei leidnud postkastist ühtegi kirja saatjalt ${senderQuery}.`,
      introText: `Siin on viimane kiri saatjalt ${senderQuery}`,
      query: `in:inbox from:"${this.escapeGmailQueryValue(senderQuery)}"`,
    });
  }

  async readLatestMessageBySubject(subjectQuery: string): Promise<GmailReadResult> {
    return this.readLatestMatchingMessage({
      emptyResponseText: `Ma ei leidnud postkastist ühtegi kirja teemaga ${subjectQuery}.`,
      introText: `Siin on viimane kiri teemaga ${subjectQuery}`,
      query: `in:inbox subject:"${this.escapeGmailQueryValue(subjectQuery)}"`,
    });
  }

  async listUnreadMessages(limit = 10): Promise<GmailInboxResult> {
    return this.searchMessages({
      label: 'Leidsin lugemata kirjad',
      emptyResponseText: 'Sul ei ole praegu ühtegi lugemata kirja.',
      limit,
      query: 'in:inbox is:unread',
    });
  }

  async readMessageFromSearchResults(position: number | 'last'): Promise<GmailReadResult> {
    if (this.searchResultsCache.length === 0) {
      return {
        status: 'ready',
        responseText: 'Mul ei ole veel ühtegi leitud kirjade nimekirja. Ütle enne näiteks otsi kiri saatjalt Amazon või näita lugemata kirjad.',
        message: null,
      };
    }

    const selectedIndex = position === 'last' ? 0 : position - 1;

    if (selectedIndex < 0 || selectedIndex >= this.searchResultsCache.length) {
      const requestedLabel =
        position === 'last' ? 'viimast leitud' : `${this.formatPositionLabel(position)} leitud (${position}.)`;

      return {
        status: 'ready',
        responseText: `Selles leitud kirjade nimekirjas ei ole ${requestedLabel} kirja. Praegu on nimekirjas ${this.searchResultsCache.length} kirja.`,
        message: null,
      };
    }

    const message = this.searchResultsCache[selectedIndex];
    const ordinalText = position === 'last' ? 'viimane leitud' : `${this.formatPositionLabel(position)} leitud`;
    const snippetText = message.snippet ? ` Sisu algus: ${message.snippet}.` : '';

    return {
      status: 'ready',
      responseText: `Siin on ${ordinalText} kiri. Teema: ${message.subject}. Saatja: ${message.from}. Kuupäev: ${message.date}.${snippetText}`,
      message,
    };
  }

  async readLatestUnreadMessage(): Promise<GmailReadResult> {
    return this.readLatestMatchingMessage({
      emptyResponseText: 'Sul ei ole praegu ühtegi lugemata kirja.',
      introText: 'Siin on viimane lugemata kiri',
      query: 'in:inbox is:unread',
    });
  }

  async countMessagesBySender(senderQuery: string) {
    return this.countMessages(`in:inbox from:"${this.escapeGmailQueryValue(senderQuery)}"`);
  }

  async countMessagesBySubject(subjectQuery: string) {
    return this.countMessages(`in:inbox subject:"${this.escapeGmailQueryValue(subjectQuery)}"`);
  }

  async countUnreadMessages() {
    return this.countMessages('in:inbox is:unread');
  }

  private async searchMessages({
    query,
    limit,
    label,
    emptyResponseText,
  }: {
    query: string;
    limit: number;
    label: string;
    emptyResponseText: string;
  }): Promise<GmailInboxResult> {
    const authorizedClient = await this.getAuthorizedClient();

    if (authorizedClient.status === 'authorization_required') {
      this.searchResultsCache = [];
      return authorizedClient.result;
    }

    try {
      const messages = await this.fetchMessages(authorizedClient.client, {
        limit,
        query,
      });
      this.searchResultsCache = messages;

      return {
        status: 'ready',
        responseText:
          messages.length === 0
            ? emptyResponseText
            : this.buildMessagesSummaryText(messages, `${label} (${messages.length})`, Math.min(limit, messages.length)),
        messages,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Gmail message search request failed');
      this.searchResultsCache = [];
      return this.buildAuthorizationRequiredResult(authorizedClient.client);
    }
  }

  private async countMessages(query: string) {
    const authorizedClient = await this.getAuthorizedClient();

    if (authorizedClient.status === 'authorization_required') {
      return authorizedClient.result;
    }

    try {
      const total = await this.fetchMessageCount(authorizedClient.client, query);

      return {
        status: 'ready' as const,
        responseText: `Leidsin ${total} kirja.`,
        total,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Gmail message count request failed');
      return this.buildAuthorizationRequiredResult(authorizedClient.client);
    }
  }

  private async readLatestMatchingMessage({
    query,
    introText,
    emptyResponseText,
  }: {
    query: string;
    introText: string;
    emptyResponseText: string;
  }): Promise<GmailReadResult> {
    const authorizedClient = await this.getAuthorizedClient();

    if (authorizedClient.status === 'authorization_required') {
      return authorizedClient.result;
    }

    try {
      const messages = await this.fetchMessages(authorizedClient.client, {
        limit: 1,
        query,
      });
      const message = messages[0] ?? null;

      if (!message) {
        return {
          status: 'ready',
          responseText: emptyResponseText,
          message: null,
        };
      }

      const snippetText = message.snippet ? ` Sisu algus: ${message.snippet}.` : '';

      return {
        status: 'ready',
        responseText: `${introText}. Teema: ${message.subject}. Saatja: ${message.from}. Kuupäev: ${message.date}.${snippetText}`,
        message,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Gmail filtered message read request failed');
      return this.buildAuthorizationRequiredResult(authorizedClient.client);
    }
  }

  private async createOAuthClient() {
    const credentials = this.readCredentials();

    if (!credentials) {
      return null;
    }

    const redirectUri = credentials.redirectUri;

    return new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      redirectUri,
    );
  }

  private async fetchLatestMessages(
    client: InstanceType<typeof google.auth.OAuth2>,
    limit: number,
  ): Promise<GmailMessageSummary[]> {
    return this.fetchMessages(client, {
      limit,
      query: 'in:inbox',
    });
  }

  private async fetchMessages(
    client: InstanceType<typeof google.auth.OAuth2>,
    options: {
      limit: number;
      query: string;
    },
  ): Promise<GmailMessageSummary[]> {
    const gmailApi = google.gmail({
      version: 'v1',
      auth: client,
    });

    const listResponse = await gmailApi.users.messages.list({
      userId: 'me',
      maxResults: options.limit,
      q: options.query,
    });

    const messageRefs = listResponse.data.messages ?? [];
    const messages: GmailMessageSummary[] = [];

    for (const ref of messageRefs) {
      if (!ref.id) {
        continue;
      }

      const messageResponse = await gmailApi.users.messages.get({
        userId: 'me',
        id: ref.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });

      const headers = messageResponse.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value?.trim() || '';

      messages.push({
        id: ref.id,
        from: getHeader('From') || 'Saatja puudub',
        subject: getHeader('Subject') || 'Teema puudub',
        date: getHeader('Date') || 'Kuupäev puudub',
        snippet: messageResponse.data.snippet?.trim() || '',
      });
    }

    return messages;
  }

  private async fetchMessageCount(
    client: InstanceType<typeof google.auth.OAuth2>,
    query: string,
  ): Promise<number> {
    const gmailApi = google.gmail({
      version: 'v1',
      auth: client,
    });
    let total = 0;
    let nextPageToken: string | undefined;

    do {
      const listResponse = await gmailApi.users.messages.list({
        userId: 'me',
        maxResults: 100,
        pageToken: nextPageToken,
        q: query,
      });

      total += listResponse.data.messages?.length ?? 0;
      nextPageToken = listResponse.data.nextPageToken ?? undefined;
    } while (nextPageToken);

    return total;
  }

  private async getAuthorizedClient(): Promise<AuthorizedClientResult> {
    const client = await this.createOAuthClient();

    if (!client) {
      return {
        status: 'authorization_required',
        result: this.buildConfigurationRequiredResult(),
      };
    }

    const token = await this.readToken();

    if (!token?.refresh_token && !token?.access_token) {
      return {
        status: 'authorization_required',
        result: this.buildAuthorizationRequiredResult(client),
      };
    }

    client.setCredentials(token);

    return {
      status: 'authorized',
      client,
    };
  }

  private readCredentials() {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      return null;
    }

    return {
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: resolveGmailStyleRedirectUri(),
    };
  }

  private async readToken(): Promise<Credentials | null> {
    try {
      const fileContent = await fs.readFile(this.tokenPath, 'utf8');
      return this.normalizeToken(JSON.parse(fileContent) as Credentials);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }

  private async saveToken(token: Credentials) {
    await fs.mkdir(path.dirname(this.tokenPath), { recursive: true });
    await fs.writeFile(this.tokenPath, JSON.stringify(this.normalizeToken(token), null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.chmod(this.tokenPath, 0o600);
  }

  private buildAuthorizationRequiredResult(
    client: InstanceType<typeof google.auth.OAuth2>,
  ): GmailAuthorizationRequiredResult {
    return {
      status: 'authorization_required',
      responseText:
        'Gmaili kohalik autoriseerimine on veel tegemata. Ava /api/gmail/google/auth-url ja lõpeta autoriseerimine esmalt.',
      authUrl: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: this.scopes,
      }),
      tokenPath: this.tokenPath,
    };
  }

  private buildConfigurationRequiredResult(): GmailAuthorizationRequiredResult {
    return {
      status: 'authorization_required',
      responseText:
        'Gmaili Google OAuth seaded puuduvad. Määra .env failis GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ja GOOGLE_REDIRECT_URI.',
      authUrl: '',
      tokenPath: this.tokenPath,
    };
  }

  private normalizeToken(token: Credentials): Credentials {
    return {
      ...token,
      access_token: token.access_token ?? undefined,
      refresh_token: token.refresh_token ?? undefined,
      scope: token.scope ?? undefined,
      token_type: token.token_type ?? undefined,
      expiry_date: token.expiry_date ?? undefined,
    };
  }

  private buildMessagesSummaryText(messages: GmailMessageSummary[], label: string, summaryCount: number) {
    return `${label}: ${messages
      .slice(0, summaryCount)
      .map((message) => `${message.subject} (${message.from})`)
      .join('; ')}.`;
  }

  private escapeGmailQueryValue(value: string) {
    return value.replace(/["]+/g, ' ').trim();
  }

  private toGoogleAuthorizationError(error: unknown): AppError {
    logger.warn({ err: error }, 'Gmail token exchange failed');

    const gaxiosError = error as GaxiosError<{
      error?: string;
      error_description?: string;
    }>;
    const googleError = gaxiosError.response?.data?.error;
    const googleDescription = gaxiosError.response?.data?.error_description?.toLowerCase() ?? '';
    const message = `${gaxiosError.message ?? ''} ${googleDescription}`.toLowerCase();
    const isInvalidCode =
      googleError === 'invalid_grant' ||
      message.includes('invalid_grant') ||
      message.includes('malformed auth code') ||
      message.includes('bad request');

    if (isInvalidCode) {
      return new AppError(
        'Gmaili autoriseerimiskood on vigane, vales vormingus või aegunud. Loo uus kood Google logist ja proovi uuesti.',
        400,
        'GMAIL_AUTHORIZATION_FAILED',
      );
    }

    return new AppError(
      'Gmaili autoriseerimine ebaõnnestus. Palun loo uus autoriseerimiskood ja proovi uuesti.',
      400,
      'GMAIL_AUTHORIZATION_FAILED',
    );
  }

  private formatPositionLabel(position: number) {
    const knownOrdinals: Record<number, string> = {
      1: 'esimene',
      2: 'teine',
      3: 'kolmas',
      4: 'neljas',
      5: 'viies',
      6: 'kuues',
      7: 'seitsmes',
      8: 'kaheksas',
      9: 'üheksas',
      10: 'kümnes',
    };

    return knownOrdinals[position] ?? `${position}.`;
  }
}

function decodeGmailBodyData(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function extractPlainTextFromPayload(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) {
    return '';
  }

  const mime = part.mimeType ?? '';

  if (mime === 'text/plain' && part.body?.data) {
    return decodeGmailBodyData(part.body.data);
  }

  if (part.parts) {
    for (const child of part.parts) {
      const plain = extractPlainTextFromPayload(child);
      if (plain) {
        return plain;
      }
    }
  }

  return '';
}

function buildRfc822PlainText(to: string, subject: string, text: string): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  return [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
  ].join('\r\n');
}
