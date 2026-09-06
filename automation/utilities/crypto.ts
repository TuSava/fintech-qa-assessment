import * as crypto from 'crypto';

export class CryptoUtil {
  /**
   * Generates a hex-encoded HMAC-SHA256 signature over the payload string using secret key
   */
  public static signHmacSha256(payload: string | object, secret: string): string {
    const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');
  }

  /**
   * Verifies an incoming HMAC signature
   */
  public static verifyHmacSha256(payload: string | object, signature: string, secret: string): boolean {
    const expected = this.signHmacSha256(payload, secret);
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  }

  /**
   * Generates a secure random unique transaction or nonce ID
   */
  public static generateId(prefix: string = 'tx'): string {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Returns current Unix timestamp in seconds
   */
  public static currentTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }
}
