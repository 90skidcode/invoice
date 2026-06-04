import { generateKeyPairSync } from 'node:crypto';

export interface JwtKeys {
  private: string;
  public: string;
}

/**
 * Load the RS256 keypair (§11.1). Prefers base64-encoded PEM from env so tokens
 * survive restarts; falls back to an ephemeral dev keypair with a warning.
 */
export function loadJwtKeys(log?: { warn: (msg: string) => void }): JwtKeys {
  const privB64 = process.env['JWT_PRIVATE_KEY_B64'];
  const pubB64 = process.env['JWT_PUBLIC_KEY_B64'];

  if (privB64 && pubB64) {
    return {
      private: Buffer.from(privB64, 'base64').toString('utf8'),
      public: Buffer.from(pubB64, 'base64').toString('utf8'),
    };
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const msg =
    'JWT_PRIVATE_KEY_B64/JWT_PUBLIC_KEY_B64 not set — generated an ephemeral RS256 keypair (dev only; tokens invalidate on restart).';
  if (log) log.warn(msg);
  else console.warn(msg);

  return { private: privateKey, public: publicKey };
}
