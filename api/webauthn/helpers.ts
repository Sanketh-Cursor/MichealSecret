export function toBase64Url(data: ArrayBuffer | Buffer | Uint8Array): string {
  const buffer = data instanceof Buffer ? data : Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data));
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromBase64Url(base64url: string): Buffer {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=');
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}
