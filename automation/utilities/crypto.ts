import * as crypto from 'crypto';

export class CryptoUtil {
  // Security utility: sign payload with HMAC SHA256 using secret key
  public static signHmacSha256(payload: string | object, secret: string): string {
    const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');
  }

  // Security utility: verify incoming HMAC signature against expected hash
  public static verifyHmacSha256(payload: string | object, signature: string, secret: string): boolean {
    const expected = this.signHmacSha256(payload, secret);
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  }

  // Id utility: generate secure random unique transaction or nonce id
  public static generateId(prefix: string = 'tx'): string {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  // Time utility: return current Unix timestamp in seconds
  public static currentTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }
}
