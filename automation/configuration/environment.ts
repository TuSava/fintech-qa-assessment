export interface EnvironmentConfig {
  baseUrl: string;
  timeout: number;
  tenants: {
    alpha: {
      id: string;
      currency: string;
      pspSecret: string;
      gspSecret: string;
    };
    beta: {
      id: string;
      currency: string;
      pspSecret: string;
      gspSecret: string;
    };
  };
}

export const Config: EnvironmentConfig = {
  baseUrl: process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1',
  timeout: parseInt(process.env.TEST_TIMEOUT || '10000', 10),
  tenants: {
    alpha: {
      id: process.env.TENANT_ALPHA_ID || 'tenant_alpha',
      currency: 'EUR',
      pspSecret: process.env.PSP_SECRET_ALPHA || 'sec_live_alpha_psp_8f93bc817',
      gspSecret: process.env.GSP_SECRET_ALPHA || 'sec_live_alpha_gsp_4d1109aa7',
    },
    beta: {
      id: process.env.TENANT_BETA_ID || 'tenant_beta',
      currency: 'USD',
      pspSecret: process.env.PSP_SECRET_BETA || 'sec_live_beta_psp_1a2b3c4d5',
      gspSecret: process.env.GSP_SECRET_BETA || 'sec_live_beta_gsp_9z8y7x6w5',
    },
  },
};
