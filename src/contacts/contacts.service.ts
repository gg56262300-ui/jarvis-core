import fs from 'node:fs/promises';
import path from 'node:path';

import type { Credentials } from 'google-auth-library';
import { google } from 'googleapis';

import { env } from '../config/index.js';
import { AppError } from '../shared/errors/app-error.js';

const CONTACTS_SCOPES = [
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts',
];

type ContactsAuthorizationRequiredResult = {
  status: 'authorization_required';
  responseText: string;
  authUrl: string;
  tokenPath: string;
};

type ContactListItem = {
  name: string;
  phone: string;
  email: string;
};

type ContactsReadyResult = {
  status: 'ready';
  responseText: string;
  contacts: ContactListItem[];
};

type ContactCreateResult =
  | ContactsAuthorizationRequiredResult
  | {
      status: 'ready';
      responseText: string;
      contact: {
        resourceName: string;
        name: string;
        phone: string;
        email: string;
      };
    };

type CreateContactInput = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type GooglePeopleConnection = {
  names?: Array<{ displayName?: string | null }> | null;
  phoneNumbers?: Array<{ value?: string | null }> | null;
  emailAddresses?: Array<{ value?: string | null }> | null;
};

type GooglePeopleConnectionsListResponse = {
  data: {
    connections?: GooglePeopleConnection[] | null;
    nextPageToken?: string | null;
  };
};

type ContactPhoneLookupResult =
  | ContactsAuthorizationRequiredResult
  | {
      status: 'ready';
      responseText: string;
      match: ContactListItem | null;
    };

export class ContactsService {
  private readonly tokenPath = path.resolve(process.cwd(), 'data/google-contacts-token.json');

  async getAuthorizationUrl() {
    const client = this.createOAuthClient();

    return {
      authUrl: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: CONTACTS_SCOPES,
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
          scope: CONTACTS_SCOPES,
        }),
        tokenPath: this.tokenPath,
      };
    }

    client.setCredentials(token);

    const people = google.people({
      version: 'v1',
      auth: client,
    });

    const contacts: ContactListItem[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const response = (await people.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        pageToken,
        personFields: 'names,emailAddresses,phoneNumbers',
      })) as GooglePeopleConnectionsListResponse;

      const connections = response.data.connections ?? [];

      const batch: ContactListItem[] =
        connections.map((person) => ({
          name: person.names?.[0]?.displayName ?? '',
          phone: person.phoneNumbers?.[0]?.value ?? '',
          email: person.emailAddresses?.[0]?.value ?? '',
        })) ?? [];

      for (const item of batch) {
        if (item.name || item.phone || item.email) {
          contacts.push(item);
          if (contacts.length >= limit) {
            break;
          }
        }
      }

      if (contacts.length >= limit) {
        break;
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    const shortList = contacts.slice(0, limit);

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

    const matches = listed.contacts
      .filter((contact) => {
        const haystack = [contact.name, contact.phone, contact.email]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      })
      .slice(0, limit);

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

  async findContactByPhone(phone: string): Promise<ContactPhoneLookupResult> {
    const normalizedTarget = this.normalizePhone(phone);

    if (!normalizedTarget) {
      return {
        status: 'ready',
        responseText: 'Telefoninumber puudub või on vigane.',
        match: null,
      };
    }

    const listed = await this.listContacts(10000);

    if (listed.status !== 'ready') {
      return listed;
    }

    const match =
      listed.contacts.find((contact) => this.normalizePhone(contact.phone) == normalizedTarget) ?? null;

    return {
      status: 'ready',
      responseText: match
        ? `Telefoniga kontakt on olemas: ${phone}.`
        : `Telefoniga kontakti ei leitud: ${phone}.`,
      match,
    };
  }

  async createContact(input: CreateContactInput): Promise<ContactCreateResult> {
    const client = this.createOAuthClient();
    const token = await this.readToken();

    if (!token) {
      return {
        status: 'authorization_required',
        responseText: 'Google Contacts ei ole veel autoriseeritud kirjutamiseks.',
        authUrl: client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: CONTACTS_SCOPES,
        }),
        tokenPath: this.tokenPath,
      };
    }

    const name = (input.name ?? '').trim();
    const phone = (input.phone ?? '').trim();
    const email = (input.email ?? '').trim();

    if (!name && !phone && !email) {
      throw new AppError(
        'Kontakti loomiseks on vaja vähemalt nime, telefoni või e-posti.',
        400,
        'CONTACT_CREATE_INPUT_REQUIRED',
      );
    }

    client.setCredentials(token);

    const people = google.people({
      version: 'v1',
      auth: client,
    });

    const created = await people.people.createContact({
      requestBody: {
        names: name ? [{ givenName: name, displayName: name }] : undefined,
        phoneNumbers: phone ? [{ value: phone }] : undefined,
        emailAddresses: email ? [{ value: email }] : undefined,
      },
    });

    return {
      status: 'ready',
      responseText: `Google Contact loodud: ${name || phone || email}.`,
      contact: {
        resourceName: created.data.resourceName ?? '',
        name,
        phone,
        email,
      },
    };
  }

  private normalizePhone(value: string | null | undefined): string {
    return (value ?? '').replace(/\D+/g, '');
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
