export type WhatsappInboundMessage = {
  phone: string;
  name: string | null;
  message: string | null;
  projectCode?: string | null;
  city?: string | null;
  serviceType?: string | null;
  channel: 'whatsapp';
};
