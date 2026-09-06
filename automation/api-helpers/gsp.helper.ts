import { APIRequestContext, APIResponse } from '@playwright/test';
import { CryptoUtil } from '../utilities/crypto';

export interface GspBetPayload {
  event_type: 'BET';
  round_id: string;
  tenant_id: string;
  user_id: string;
  game_id: string;
  bet_amount: number;
  currency: string;
  timestamp: number;
}

export interface GspWinPayload {
  event_type: 'WIN';
  round_id: string;
  tenant_id: string;
  user_id: string;
  game_id: string;
  win_amount: number;
  currency: string;
  timestamp: number;
}

export class GspHelper {
  constructor(private request: APIRequestContext) {}

  public async sendBetCallback(payload: GspBetPayload, secret: string, overrideSig?: string): Promise<APIResponse> {
    const raw = JSON.stringify(payload);
    const signature = overrideSig !== undefined ? overrideSig : CryptoUtil.signHmacSha256(raw, secret);

    return this.request.post('/callbacks/gsp/bet', {
      headers: {
        'X-Tenant-ID': payload.tenant_id,
        'X-GSP-Signature': signature,
      },
      data: payload,
    });
  }

  public async sendWinCallback(payload: GspWinPayload, secret: string, overrideSig?: string): Promise<APIResponse> {
    const raw = JSON.stringify(payload);
    const signature = overrideSig !== undefined ? overrideSig : CryptoUtil.signHmacSha256(raw, secret);

    return this.request.post('/callbacks/gsp/win', {
      headers: {
        'X-Tenant-ID': payload.tenant_id,
        'X-GSP-Signature': signature,
      },
      data: payload,
    });
  }
}
