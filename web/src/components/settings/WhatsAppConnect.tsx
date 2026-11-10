import { useEffect, useRef, useState } from 'react';
import { Button, Icon } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { completeWhatsappSignup } from '@/services';
import { env } from '@/utils/env';
import { toMessage } from '@/utils/errors';

/**
 * Meta Embedded Signup, ported from OrderFlow's WhatsAppPage. The popup
 * returns a login code (FB.login callback) and, separately, the phone/WABA
 * ids the merchant picked (a postMessage). When both are in, the code goes to
 * the completeWhatsappSignup Cloud Function, which stores the token where no
 * browser can read it.
 */
export const embeddedSignupConfigured = Boolean(env.meta.appId && env.meta.configId);

interface Payload {
  phoneNumberId: string;
  businessAccountId: string;
}

declare global {
  interface Window {
    FB?: {
      init: (o: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
      login: (cb: (r: { authResponse?: { code?: string } | null }) => void, o: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let sdk: Promise<void> | null = null;
function loadSdk(appId: string): Promise<void> {
  if (sdk) return sdk;
  sdk = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v21.0' });
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true;
    s.defer = true;
    s.onerror = () => {
      sdk = null;
      reject(new Error('Could not load Facebook. Check your internet connection.'));
    };
    document.body.appendChild(s);
  });
  return sdk;
}

export function WhatsAppConnectButton({ onConnected }: { onConnected?: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const code = useRef<string | null>(null);
  const payload = useRef<Payload | null>(null);

  const finish = async () => {
    if (!code.current || !payload.current) return;
    const input = { code: code.current, ...payload.current };
    code.current = null;
    payload.current = null;
    try {
      const r = await completeWhatsappSignup(input);
      toast.success(`WhatsApp connected: ${r.displayPhone}`);
      onConnected?.();
    } catch (e) {
      toast.error(toMessage(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
      try {
        const data = JSON.parse(event.data as string) as { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string } };
        if (data.type !== 'WA_EMBEDDED_SIGNUP' || data.event !== 'FINISH' || !data.data?.phone_number_id || !data.data.waba_id) return;
        payload.current = { phoneNumberId: data.data.phone_number_id, businessAccountId: data.data.waba_id };
        void finish();
      } catch {
        // not the message we want
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });

  if (!embeddedSignupConfigured) {
    return <p className="rounded-lg bg-raised px-3 py-2 text-sm text-muted">WhatsApp connection isn't switched on for this SellEazy server yet. See README → "Connect WhatsApp".</p>;
  }

  const start = async () => {
    setBusy(true);
    try {
      await loadSdk(env.meta.appId);
      window.FB?.login(
        (r) => {
          if (!r.authResponse?.code) return setBusy(false);
          code.current = r.authResponse.code;
          void finish();
        },
        { config_id: env.meta.configId, response_type: 'code', override_default_response_type: true, extras: { feature: 'whatsapp_embedded_signup', sessionInfoVersion: '3' } },
      );
    } catch (e) {
      toast.error(toMessage(e));
      setBusy(false);
    }
  };

  return (
    <Button loading={busy} onClick={() => void start()} className="bg-[#1877F2] border-[#1877F2] hover:bg-[#166FE5]">
      <Icon name="chat" /> Continue with Facebook
    </Button>
  );
}
