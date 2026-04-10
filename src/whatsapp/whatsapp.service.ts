import { ContactsService } from '../contacts/contacts.service.js';
import { CrmService } from '../crm/crm.service.js';
import type { WhatsappInboundMessage } from './whatsapp.types.js';

export class WhatsappService {
  private readonly crmService = new CrmService();
  private readonly contactsService = new ContactsService();

  private readonly workflowOwner = 'whatsapp' as const;
  private readonly storageOwner = 'crm' as const;
  private readonly contactSyncOwner = 'contacts' as const;
  private readonly pipelineStage = 'whatsapp_intake' as const;

  private normalizeProjectCode(value: string | null | undefined): string | null {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!normalized) return null;

    const map: Record<string, string> = {
      remont: 'remont',
      hooldus: 'hooldus',
      kinnisvara: 'kinnisvara',
      jats: 'jats',
      jäts: 'jats',
      pir: 'pir',
      osb: 'osb',
      vineer: 'vineer',
    };

    return map[normalized] ?? null;
  }

  private normalizeCity(value: string | null | undefined): string | null {
    const normalized = (value ?? '').trim().replace(/\s+/g, ' ');
    if (!normalized) return null;

    return normalized
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private normalizeServiceType(value: string | null | undefined): string | null {
    const normalized = (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    return normalized || null;
  }

  private isBusinessOpen(now = new Date()): boolean {
    if (process.env.WHATSAPP_FORCE_AFTER_HOURS === '1') return false;

    const day = now.getDay();
    const hour = now.getHours();

    const isWeekday = day >= 1 && day <= 5;
    if (!isWeekday) {
      return false;
    }

    return hour >= 8 && hour < 18;
  }

  private getAfterHoursReplyTemplateKey(input: {
    nextAction: 'ask_name' | 'ask_project_code' | 'ask_city' | 'ask_service_type' | 'ready';
  }): string {
    if (input.nextAction === 'ask_name') return 'after_hours_ask_name';
    if (input.nextAction === 'ask_project_code') return 'after_hours_ask_project_code';
    if (input.nextAction === 'ask_city') return 'after_hours_ask_city';
    if (input.nextAction === 'ask_service_type') return 'after_hours_ask_service_type';
    return 'after_hours_ready';
  }

  private getReplyText(input: {
    afterHours: boolean;
    nextAction: 'ask_name' | 'ask_project_code' | 'ask_city' | 'ask_service_type' | 'ready';
  }): string | null {
    if (!input.afterHours) {
      return null;
    }

    if (input.nextAction === 'ask_name') {
      return 'Tere. Teie pöördumine on vastu võetud. Palun kirjutage oma nimi.';
    }

    if (input.nextAction === 'ask_project_code') {
      return 'Tere. Teie pöördumine on vastu võetud. Palun kirjutage, mis valdkonnaga on tegu: kinnisvara, remont või hooldus.';
    }

    if (input.nextAction === 'ask_city') {
      return 'Tere. Teie pöördumine on vastu võetud. Palun kirjutage linn või piirkond.';
    }

    if (input.nextAction === 'ask_service_type') {
      return 'Tere. Teie pöördumine on vastu võetud. Palun kirjutage lühidalt, millist teenust vajate.';
    }

    return 'Tere. Teie pöördumine on vastu võetud. Vastame tööajal esimesel võimalusel.';
  }

  async handleInboundMessage(input: WhatsappInboundMessage) {
    const normalizedPhone = input.phone.replace(/[^\d+]/g, '').trim();

    if (!normalizedPhone) {
      return {
        status: 'error' as const,
        responseText: 'WhatsApp inbound sõnumis puudub telefoninumber.',
      };
    }

    const normalizedName = input.name?.trim() ? input.name.trim() : null;
    const normalizedProjectCode = this.normalizeProjectCode(input.projectCode ?? null);
    const normalizedCity = this.normalizeCity(input.city ?? null);
    const normalizedServiceType = this.normalizeServiceType(input.serviceType ?? null);

    const leadResult = this.crmService.upsertLead({
      source: 'whatsapp',
      phone: normalizedPhone,
      name: normalizedName,
      tag: 'whatsapp-inbound',
      notes: input.message ?? null,
      projectCode: normalizedProjectCode,
      city: normalizedCity,
      serviceType: normalizedServiceType,
    });

    const lead = leadResult.lead;

    const messageRecord =
      input.message && input.message.trim()
        ? this.crmService.addLeadMessage({
            leadId: lead.id,
            channel: 'whatsapp',
            direction: 'inbound',
            message: input.message.trim(),
          })
        : null;

    const missingFields = [
      !lead.name ? 'name' : null,
      !lead.projectCode ? 'projectCode' : null,
      !lead.city ? 'city' : null,
      !lead.serviceType ? 'serviceType' : null,
    ].filter(Boolean) as string[];

    const nextAction =
      missingFields.length === 0
        ? 'ready'
        : missingFields[0] === 'name'
          ? 'ask_name'
          : missingFields[0] === 'projectCode'
            ? 'ask_project_code'
            : missingFields[0] === 'city'
              ? 'ask_city'
              : 'ask_service_type';

    const businessOpen = this.isBusinessOpen();
    const afterHours = !businessOpen;
    const replyTemplateKey = afterHours
      ? this.getAfterHoursReplyTemplateKey({ nextAction })
      : null;
    const replyText = this.getReplyText({ afterHours, nextAction });

    let contactSync = null;

    if (lead.name && lead.phone) {
      try {
        const existingContacts = await this.contactsService.findContactByPhone(lead.phone);

        if (existingContacts.status === 'ready') {
          if (existingContacts.match) {
            contactSync = {
              status: 'skipped_existing',
              responseText: `Google Contact juba olemas: ${lead.phone}.`,
            };
          } else {
            const createdContact = await this.contactsService.createContact({
              name: lead.name,
              phone: lead.phone,
              email: null,
            });

            contactSync = createdContact.status === 'ready'
              ? {
                  status: 'created',
                  responseText: createdContact.responseText,
                  contact: createdContact.contact,
                }
              : {
                  status: 'authorization_required',
                  responseText: createdContact.responseText,
                  authUrl: createdContact.authUrl,
                  tokenPath: createdContact.tokenPath,
                };
          }
        } else {
          contactSync = {
            status: 'authorization_required',
            responseText: existingContacts.responseText,
            authUrl: existingContacts.authUrl,
            tokenPath: existingContacts.tokenPath,
          };
        }
      } catch (error) {
        contactSync = {
          status: 'error',
          responseText: error instanceof Error ? error.message : 'Google Contact sync ebaõnnestus.',
        };
      }
    }

    return {
      status: 'ready' as const,
      workflowOwner: this.workflowOwner,
      storageOwner: this.storageOwner,
      contactSyncOwner: this.contactSyncOwner,
      pipelineStage: this.pipelineStage,
      responseText: leadResult.isNewLead
        ? `WhatsApp uus lead salvestatud: ${lead.phone}.`
        : `WhatsApp olemasolev lead uuendatud: ${lead.phone}.`,
      leadStatus: leadResult.isNewLead ? 'new' as const : 'updated' as const,
      isNewLead: leadResult.isNewLead,
      nextAction,
      missingFields,
      businessOpen,
      afterHours,
      replyTemplateKey,
      replyText,
      lead,
      messageRecord,
      contactSync,
    };
  }
}
