import { test as base, APIRequestContext } from '@playwright/test';
import { AuthHelper } from '../api-helpers/auth.helper';
import { WalletHelper } from '../api-helpers/wallet.helper';
import { PspHelper } from '../api-helpers/psp.helper';
import { GspHelper } from '../api-helpers/gsp.helper';

type TestFixtures = {
  authHelper: AuthHelper;
  walletHelper: WalletHelper;
  pspHelper: PspHelper;
  gspHelper: GspHelper;
};

export const test = base.extend<TestFixtures>({
  authHelper: async ({ request }, use) => {
    await use(new AuthHelper(request));
  },
  walletHelper: async ({ request }, use) => {
    await use(new WalletHelper(request));
  },
  pspHelper: async ({ request }, use) => {
    await use(new PspHelper(request));
  },
  gspHelper: async ({ request }, use) => {
    await use(new GspHelper(request));
  },
});

export { expect } from '@playwright/test';
