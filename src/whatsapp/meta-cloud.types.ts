/** Meta WhatsApp Cloud API webhook payload (väljavõte — ainult vajalik). */
export type MetaWhatsappWebhookBody = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        messages?: MetaInboundMessage[];
        statuses?: unknown[];
      };
    }>;
  }>;
};

export type MetaInboundMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
};
