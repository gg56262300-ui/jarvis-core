import fs from 'node:fs/promises';
import path from 'node:path';

import webpush from 'web-push';

import { env } from '../config/index.js';
import { logger } from '../shared/logger/logger.js';

type PushSubscriptionLike = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
};

type StoredSubscriptions = {
  subscriptions: PushSubscriptionLike[];
};

type VapidKeys = {
  publicKey: string;
  privateKey: string;
};

export class PushService {
  private readonly subscriptionsPath = path.resolve(
    process.cwd(),
    env.PUSH_SUBSCRIPTIONS_PATH ?? 'data/push-subscriptions.json',
  );

  private readonly vapidPath = path.resolve(
    process.cwd(),
    env.PUSH_VAPID_KEYS_PATH ?? 'data/push-vapid.json',
  );

  private vapid: VapidKeys | null = null;

  async getVapidPublicKey(): Promise<string | null> {
    const vapid = await this.ensureVapidKeys();
    return vapid?.publicKey ?? null;
  }

  isPairCodeValid(rawCode: string | null | undefined): boolean {
    const code = String(rawCode ?? '').trim();
    const configured = (env.PUSH_PAIR_CODE ?? '').trim();
    const bridgeFallback = (process.env.JARVIS_BRIDGE_TOKEN ?? '').trim();
    const expected = configured || bridgeFallback;
    return Boolean(expected) && code === expected;
  }

  async upsertSubscription(subscription: PushSubscriptionLike) {
    const existing = await this.readSubscriptions();
    const normalized = this.normalizeSubscription(subscription);
    if (!normalized) return { ok: false as const, error: 'INVALID_SUBSCRIPTION' as const };

    const without = existing.subscriptions.filter((s) => s.endpoint !== normalized.endpoint);
    without.push(normalized);
    await this.writeSubscriptions({ subscriptions: without });
    return { ok: true as const, count: without.length };
  }

  async notifyPendingConfirmation(input: { label?: string; id?: string }) {
    const vapid = await this.ensureVapidKeys();
    if (!vapid) return { ok: false as const, error: 'VAPID_NOT_READY' as const };

    const store = await this.readSubscriptions();
    if (store.subscriptions.length === 0) return { ok: true as const, sent: 0, remaining: 0 };

    webpush.setVapidDetails(
      env.PUSH_SUBJECT ?? 'mailto:jarvis@localhost',
      vapid.publicKey,
      vapid.privateKey,
    );

    const title = 'Jarvis: vaja kinnitust';
    const body =
      input.label?.trim() ||
      input.id?.trim() ||
      'Vaja kinnitust — ava Jarvis ja vajuta JAH/EI (või võta ühendust Robertiga).';
    const payload = JSON.stringify({
      title,
      body,
      url: '/chat.html',
    });

    const nextSubscriptions: PushSubscriptionLike[] = [];
    let sent = 0;

    for (const sub of store.subscriptions) {
      try {
        await webpush.sendNotification(
          sub as Parameters<typeof webpush.sendNotification>[0],
          payload,
        );
        nextSubscriptions.push(sub);
        sent += 1;
      } catch (error: unknown) {
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? Number((error as { statusCode?: unknown }).statusCode ?? 0) || 0
            : 0;
        const shouldDrop = statusCode === 404 || statusCode === 410;
        logger.warn({ err: error, statusCode, endpoint: sub.endpoint }, 'Push send failed');
        if (!shouldDrop) {
          nextSubscriptions.push(sub);
        }
      }
    }

    if (nextSubscriptions.length !== store.subscriptions.length) {
      await this.writeSubscriptions({ subscriptions: nextSubscriptions });
    }

    return { ok: true as const, sent, remaining: nextSubscriptions.length };
  }

  private async ensureVapidKeys(): Promise<VapidKeys | null> {
    if (this.vapid) return this.vapid;

    const configuredPublic = (env.PUSH_VAPID_PUBLIC_KEY ?? '').trim();
    const configuredPrivate = (env.PUSH_VAPID_PRIVATE_KEY ?? '').trim();

    if (configuredPublic && configuredPrivate) {
      this.vapid = { publicKey: configuredPublic, privateKey: configuredPrivate };
      return this.vapid;
    }

    // Fallback: generate once and store to disk so push can work without editing .env.
    try {
      const file = await fs.readFile(this.vapidPath, 'utf8');
      const parsed = JSON.parse(file) as Partial<VapidKeys>;
      if (parsed.publicKey && parsed.privateKey) {
        this.vapid = { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
        return this.vapid;
      }
    } catch {
      // ignore missing file
    }

    try {
      const keys = webpush.generateVAPIDKeys();
      this.vapid = { publicKey: keys.publicKey, privateKey: keys.privateKey };
      await fs.mkdir(path.dirname(this.vapidPath), { recursive: true });
      await fs.writeFile(this.vapidPath, JSON.stringify(this.vapid, null, 2), { encoding: 'utf8', mode: 0o600 });
      await fs.chmod(this.vapidPath, 0o600);
      logger.info({ path: this.vapidPath }, 'Generated VAPID keys for push');
      return this.vapid;
    } catch (error) {
      logger.warn({ err: error }, 'Failed to generate VAPID keys');
      return null;
    }
  }

  private normalizeSubscription(subscription: PushSubscriptionLike): PushSubscriptionLike | null {
    const endpoint = String(subscription?.endpoint ?? '').trim();
    if (!endpoint.startsWith('https://')) return null;

    const p256dh = String(subscription?.keys?.p256dh ?? '').trim();
    const auth = String(subscription?.keys?.auth ?? '').trim();
    if (!p256dh || !auth) return null;

    return { endpoint, keys: { p256dh, auth } };
  }

  private async readSubscriptions(): Promise<StoredSubscriptions> {
    try {
      const raw = await fs.readFile(this.subscriptionsPath, 'utf8');
      const parsed = JSON.parse(raw) as StoredSubscriptions;
      if (!Array.isArray(parsed.subscriptions)) return { subscriptions: [] };
      return { subscriptions: parsed.subscriptions.filter(Boolean) as PushSubscriptionLike[] };
    } catch {
      return { subscriptions: [] };
    }
  }

  private async writeSubscriptions(store: StoredSubscriptions) {
    await fs.mkdir(path.dirname(this.subscriptionsPath), { recursive: true });
    await fs.writeFile(this.subscriptionsPath, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
    await fs.chmod(this.subscriptionsPath, 0o600);
  }
}

export const pushService = new PushService();

