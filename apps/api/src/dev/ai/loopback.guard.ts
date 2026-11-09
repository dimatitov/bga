/**
 * Dev AI guard (SWR-005B, plan-backend BD-8, AC-08): paid diagnostics only from this machine. A request passes only
 * when ALL hold:
 *   - the TCP peer (`req.socket.remoteAddress`, never a client header; trust proxy is off) is loopback;
 *   - `Host` is a loopback host (`localhost`, `127.x.x.x`, `[::1]`, any port) — defeats DNS rebinding;
 *   - `Origin`, when present, is an http(s) loopback origin — defeats cross-site browser requests (CSRF);
 *   - every `X-Forwarded-For` hop, when present, is loopback (a local proxy forwarding a remote client is refused);
 *   - `Sec-Fetch-Site` is not `cross-site`.
 * Otherwise 403 `AI_DEV_FORBIDDEN` (no details).
 */
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ERROR_MESSAGE_KEYS } from '@bga/platform';
import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';
import { ApiError } from '../../common/api-error';

/** Minimal request shape the guard reads. */
export interface DevGuardRequest {
  headers: IncomingHttpHeaders;
  socket?: { remoteAddress?: string | undefined } | null;
}

export function devForbidden(): ApiError {
  return new ApiError('AI_DEV_FORBIDDEN', ERROR_MESSAGE_KEYS.aiDevForbidden);
}

/** True for 127.0.0.0/8, ::1 and IPv4-mapped 127.x (`::ffff:127.0.0.1`). */
export function isLoopbackAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  let a = address.trim().toLowerCase();
  if (a.startsWith('[') && a.endsWith(']')) a = a.slice(1, -1);
  if (a.startsWith('::ffff:')) a = a.slice('::ffff:'.length);
  if (isIP(a) === 4) return a.startsWith('127.');
  if (isIP(a) === 6) return a === '::1' || a === '0:0:0:0:0:0:0:1';
  return false;
}

/** Hostname of a `Host` header value without the port (`[::1]:3000` → `::1`). */
function hostnameOf(host: string): string | null {
  const h = host.trim().toLowerCase();
  if (h.length === 0) return null;
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    if (end < 0) return null;
    const rest = h.slice(end + 1);
    if (rest !== '' && !/^:\d{1,5}$/.test(rest)) return null;
    return h.slice(1, end);
  }
  const m = /^([^:]+)(?::\d{1,5})?$/.exec(h);
  return m ? (m[1] ?? null) : null;
}

export function isLoopbackHost(host: string | undefined): boolean {
  if (host === undefined) return false;
  const name = hostnameOf(host);
  if (name === null) return false;
  return name === 'localhost' || isLoopbackAddress(name);
}

export function isLoopbackOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false; // includes the opaque `null` origin
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return isLoopbackHost(url.host);
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(',') : value;
}

/** The guard decision (pure; used by both the Nest guard and the dev body gate middleware). */
export function isAllowedDevRequest(req: DevGuardRequest): boolean {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false;
  const host = req.headers.host;
  if (!isLoopbackHost(Array.isArray(host) ? host[0] : host)) return false;
  const origin = single(req.headers.origin);
  if (origin !== undefined && !isLoopbackOrigin(origin)) return false;
  const xff = single(req.headers['x-forwarded-for']);
  if (xff !== undefined) {
    const hops = xff.split(',').map((h) => h.trim());
    if (hops.some((h) => !isLoopbackAddress(h))) return false;
  }
  const site = single(req.headers['sec-fetch-site']);
  if (site !== undefined && site.trim().toLowerCase() === 'cross-site') return false;
  return true;
}

@Injectable()
export class LoopbackGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<DevGuardRequest>();
    if (!isAllowedDevRequest(req)) throw devForbidden();
    return true;
  }
}
