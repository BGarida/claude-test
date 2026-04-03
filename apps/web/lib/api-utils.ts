import { createHash, randomUUID } from 'crypto';

export function generateSlug(): string {
  return randomUUID().slice(0, 12);
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateSecret(): string {
  return randomUUID();
}

export function getAuthToken(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const shareToken = request.headers.get('x-share-token');
  if (shareToken) return shareToken;
  const url = new URL(request.url);
  return url.searchParams.get('token');
}

export function getBridgeToken(request: Request): string | null {
  const bridgeToken = request.headers.get('x-bridge-token');
  if (bridgeToken) return bridgeToken;
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export function getIdempotencyKey(request: Request): string | null {
  return (
    request.headers.get('idempotency-key') ??
    request.headers.get('x-idempotency-key') ??
    null
  );
}

export function getAgentId(request: Request): string | null {
  return request.headers.get('x-agent-id');
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export function hashRequestBody(body: unknown): string {
  try {
    return createHash('sha256')
      .update(JSON.stringify(body ?? {}))
      .digest('hex');
  } catch {
    return createHash('sha256')
      .update(String(body))
      .digest('hex');
  }
}
