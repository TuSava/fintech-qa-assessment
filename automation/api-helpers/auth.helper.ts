import { APIRequestContext, APIResponse } from '@playwright/test';

export class AuthHelper {
  constructor(private request: APIRequestContext) {}

  // Registration screen: register new player account
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

  // Login screen: authenticate user and return access token
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
