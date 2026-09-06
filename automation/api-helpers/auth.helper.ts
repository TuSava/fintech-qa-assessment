import { APIRequestContext, APIResponse } from '@playwright/test';

export class AuthHelper {
  constructor(private request: APIRequestContext) {}

  public async register(payload: {
    tenant_id: string;
    email: string;
    password: string;
    currency: string;
  }): Promise<APIResponse> {
    return this.request.post('/auth/register', {
      headers: {
        'X-Tenant-ID': payload.tenant_id,
      },
      data: payload,
    });
  }

  public async login(payload: {
    tenant_id: string;
    email: string;
    password: string;
  }): Promise<APIResponse> {
    return this.request.post('/auth/login', {
      headers: {
        'X-Tenant-ID': payload.tenant_id,
      },
      data: payload,
    });
  }
}
