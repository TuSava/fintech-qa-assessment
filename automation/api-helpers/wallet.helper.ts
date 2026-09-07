import { APIRequestContext, APIResponse } from '@playwright/test';

export class WalletHelper {
  constructor(private request: APIRequestContext) {}

  // Wallet screen: get current user balance
  public async getBalance(token: string, tenantId: string, userId?: string): Promise<APIResponse> {
    const url = userId ? `/wallet/balance?user_id=${encodeURIComponent(userId)}` : '/wallet/balance';
    return this.request.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-ID': tenantId,
      },
    });
  }

  // Transactions screen: get user transaction history list
  public async getTransactions(token: string, tenantId: string, page: number = 1, limit: number = 10): Promise<APIResponse> {
    return this.request.get(`/transactions?page=${page}&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-ID': tenantId,
      },
    });
  }
}
