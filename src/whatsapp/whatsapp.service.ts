import { CrmService } from '../crm/crm.service.js';
import type { WhatsappInboundMessage } from './whatsapp.types.js';

export class WhatsappService {
  private readonly crmService = new CrmService();

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

  handleInboundMessage(input: WhatsappInboundMessage) {
    const normalizedPhone = input.phone.replace(/[^\d+]/g, '').trim();

    if (!normalizedPhone) {
      return {
        status: 'error' as const,
        responseText: 'WhatsApp inbound sõnumis puudub telefoninumber.',
      };
    }

    const leadResult = this.crmService.upsertLead({
      source: 'whatsapp',
      phone: normalizedPhone,
      name: input.name,
      tag: 'whatsapp-inbound',
      notes: input.message ?? null,
      projectCode: input.projectCode ?? null,
      city: input.city ?? null,
      serviceType: input.serviceType ?? null,
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

    return {
      status: 'ready' as const,
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
    };
  }
}
