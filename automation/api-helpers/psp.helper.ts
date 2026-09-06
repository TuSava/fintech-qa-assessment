import { APIRequestContext, APIResponse } from '@playwright/test';
import { CryptoUtil } from '../utilities/crypto';

export interface PspDepositPayload {
  event_type: string;
  event_id: string;
  tenant_id: string;
  user_id: string;
  psp_reference_id: string;
  amount: number;
  currency: string;
  timestamp: number;
}

export class PspHelper {
  constructor(private request: APIRequestContext) {}

  public async sendDepositCallback(
    payload: PspDepositPayload,
    secret: string,
    overrideSignature?: string,
    overrideTenantHeader?: string
  ): Promise<APIResponse> {
    const rawBody = JSON.stringify(payload);
    const signature = overrideSignature !== undefined ? overrideSignature : CryptoUtil.signHmacSha256(rawBody, secret);
    const tenantHeader = overrideTenantHeader !== undefined ? overrideTenantHeader : payload.tenant_id;

    return this.request.post('/callbacks/psp/deposit', {
      headers: {
        'X-Tenant-ID': tenantHeader,
        'X-PSP-Signature': signature,
      },
      data: payload,
    });
  }
}
