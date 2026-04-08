import fs from 'node:fs/promises';
import path from 'node:path';

import type { Credentials } from 'google-auth-library';
import { google } from 'googleapis';

import { env } from '../config/index.js';
import { AppError } from '../shared/errors/app-error.js';

const CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts.readonly';

type ContactsAuthorizationRequiredResult = {
  status: 'authorization_required';
  responseText: string;
  authUrl: string;
  tokenPath: string;
};

type ContactsReadyResult = {
  status: 'ready';
  responseText: string;
  contacts: Array<{
    name: string;
    phone: string;
    email: string;
  }>;
};

export class ContactsService {
  private readonly tokenPath = path.resolve(process.cwd(), 'data/google-contacts-token.json');

  async getAuthorizationUrl() {
    const client = this.createOAuthClient();

    return {
      authUrl: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [CONTACTS_SCOPE],
      }),
      tokenPath: this.tokenPath,
      instructions:
        'Ava see link brauseris, logi Google kontoga sisse ja kleebi tagasi saadud code väärtus POST /api/contacts/google/authorize päringusse.',
    };
  }

  async completeAuthorization(code: string) {
    const client = this.createOAuthClient();

    try {
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);
      await this.saveToken(tokens);

      return {
        status: 'authorized' as const,
        responseText: 'Google Contacts on nüüd kohalikus arenduses autoriseeritud.',
        tokenPath: this.tokenPath,
      };
    } catch {
      throw new AppError(
        'Contactsi autoriseerimiskood on vigane, vales vormingus või aegunud. Loo uus kood Google logist ja proovi uuesti.',
        400,
        'CONTACTS_AUTHORIZATION_FAILED',
      );
    }
  }

  async listContacts(limit = 20): Promise<ContactsAuthorizationRequiredResult | ContactsReadyResult> {
    const client = this.createOAuthClient();
    const token = await this.readToken();

    if (!token) {
      return {
        status: 'authorization_required',
        responseText: 'Google Contacts ei ole veel autoriseeritud.',
        authUrl: client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: [CONTACTS_SCOPE],
        }),
        tokenPath: this.tokenPath,
      };
    }

    client.setCredentials(token);

    const people = google.people({
      version: 'v1',
      auth: client,
    });

    const response = await people.people.connections.list({
      resourceName: 'people/me',
      pageSize: limit,
      personFields: 'names,emailAddresses,phoneNumbers',
    });

    const contacts =
      response.data.connections?.map((person) => ({
        name: person.names?.[0]?.displayName ?? '',
        phone: person.phoneNumbers?.[0]?.value ?? '',
        email: person.emailAddresses?.[0]?.value ?? '',
      })) ?? [];

    const shortList = contacts
      .filter((item) => item.name || item.phone || item.email)
      .slice(0, limit);

    const summary =
      shortList.length === 0
        ? 'Google Contactsist kontakte ei leitud.'
        : `Leidsin ${shortList.length} kontakti: ` +
          shortList
            .map((c) => {
              const parts = [c.name, c.phone, c.email].filter(Boolean);
              return parts.join(' | ');
            })
            .join('; ');

    return {
      status: 'ready',
      responseText: summary,
      contacts: shortList,
    };
  }


  async searchContacts(query: string, limit = 10): Promise<ContactsAuthorizationRequiredResult | ContactsReadyResult> {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return {
        status: 'ready',
        responseText: 'Palun ütle nimi, telefoni number või e-posti aadress pärast sõnu otsi kontakt.',
        contacts: [],
      };
    }

    const listed = await this.listContacts(500);

    if (listed.status !== 'ready') {
      return listed;
    }

    const normalizedQuery = trimmedQuery.toLowerCase();

    const matches = listed.contacts.filter((contact) => {
      const haystack = [contact.name, contact.phone, contact.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    }).slice(0, limit);

    const responseText =
      matches.length === 0
        ? `Kontakti ei leitud: ${trimmedQuery}.`
        : `Leidsin ${matches.length} kontakti otsingule ${trimmedQuery}: ` +
          matches
            .map((contact) => {
              const parts = [contact.name, contact.phone, contact.email].filter(Boolean);
              return parts.join(' | ');
            })
            .join('; ');

    return {
      status: 'ready',
      responseText,
      contacts: matches,
    };
  }

  private createOAuthClient() {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      throw new AppError(
        'Google OAuth seaded puuduvad. Määra .env failis GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ja GOOGLE_REDIRECT_URI.',
        500,
        'CONTACTS_CONFIGURATION_MISSING',
      );
    }

    return new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI,
    );
  }

  private async readToken(): Promise<Credentials | null> {
    try {
      const raw = await fs.readFile(this.tokenPath, 'utf8');
      return JSON.parse(raw) as Credentials;
    } catch {
      return null;
    }
  }

  private async saveToken(token: Credentials) {
    await fs.mkdir(path.dirname(this.tokenPath), { recursive: true });
    await fs.writeFile(this.tokenPath, JSON.stringify(token, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
}
