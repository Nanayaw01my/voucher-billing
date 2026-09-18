import { RouterOsClient, RouterOsApiError } from './client';
import { parseRouterOsDuration, toRouterOsDuration, toNumber } from '../../utils/format';

export interface HotspotUser {
  id: string;
  name: string;
  profile?: string;
  limitUptimeSeconds: number | null;
  limitBytesTotal: number | null;
  uptimeSeconds: number | null;
  bytesIn: number | null;
  bytesOut: number | null;
  disabled: boolean;
  comment?: string;
}

export interface ActiveHotspotUser {
  id: string;
  username: string;
  address?: string;
  macAddress?: string;
  uptimeSeconds: number | null;
  sessionTimeLeftSeconds: number | null;
  bytesIn: number | null;
  bytesOut: number | null;
  loginBy?: string;
  server?: string;
}

export interface HotspotProfile {
  id: string;
  name: string;
  rateLimit?: string;
  sharedUsers?: string;
  /** Per-user accounting counters only exist when this is on. */
  accountingEnabled: boolean;
}

export interface RouterIdentity {
  identity: string;
  version: string;
  boardName?: string;
  uptimeSeconds: number | null;
}

export interface RouterHealth {
  cpuLoad: number | null;
  freeMemoryBytes: number | null;
  totalMemoryBytes: number | null;
  uptimeSeconds: number | null;
}

export interface CreateHotspotUserInput {
  name: string;
  password: string;
  profile: string;
  limitUptimeSeconds?: number | null;
  limitBytesTotalBytes?: number | null;
  comment?: string;
  server?: string;
}

function mapHotspotUser(row: Record<string, string>): HotspotUser {
  return {
    id: row['.id'] ?? '',
    name: row.name ?? '',
    profile: row.profile,
    limitUptimeSeconds: parseRouterOsDuration(row['limit-uptime']),
    limitBytesTotal: toNumber(row['limit-bytes-total']),
    uptimeSeconds: parseRouterOsDuration(row.uptime),
    bytesIn: toNumber(row['bytes-in']),
    bytesOut: toNumber(row['bytes-out']),
    disabled: row.disabled === 'true',
    comment: row.comment,
  };
}

/**
 * Typed RouterOS verbs used by the rest of the application. Nothing outside
 * services/mikrotik constructs a command sentence.
 *
 * Paths below exist identically in RouterOS v6 and v7 over the binary API.
 * `.id` values are only valid for the lifetime of a connection in v6, so every
 * write here resolves the user by `name` first.
 */
export class MikrotikService {
  constructor(private readonly client: RouterOsClient) {}

  async identity(): Promise<RouterIdentity> {
    const [identityRow] = await this.client.send(['/system/identity/print']);
    const [resourceRow] = await this.client.send(['/system/resource/print']);
    return {
      identity: identityRow?.name ?? 'unknown',
      version: resourceRow?.version ?? 'unknown',
      boardName: resourceRow?.['board-name'],
      uptimeSeconds: parseRouterOsDuration(resourceRow?.uptime),
    };
  }

  async health(): Promise<RouterHealth> {
    const [row] = await this.client.send(['/system/resource/print']);
    return {
      cpuLoad: toNumber(row?.['cpu-load']),
      freeMemoryBytes: toNumber(row?.['free-memory']),
      totalMemoryBytes: toNumber(row?.['total-memory']),
      uptimeSeconds: parseRouterOsDuration(row?.uptime),
    };
  }

  async listProfiles(): Promise<HotspotProfile[]> {
    const rows = await this.client.send(['/ip/hotspot/user/profile/print']);
    return rows.map((row) => ({
      id: row['.id'] ?? '',
      name: row.name ?? '',
      rateLimit: row['rate-limit'],
      sharedUsers: row['shared-users'],
      // RouterOS omits `add-mac-cookie`-style booleans when at default; for
      // accounting the default is "yes", so absence means enabled.
      accountingEnabled: row['accounting'] !== 'false' && row['accounting'] !== 'no',
    }));
  }

  async listHotspotUsers(limit?: number): Promise<HotspotUser[]> {
    const words = ['/ip/hotspot/user/print'];
    if (limit) words.push(`=.proplist=.id,name,profile,limit-uptime,limit-bytes-total,uptime,bytes-in,bytes-out,disabled,comment`);
    const rows = await this.client.send(words);
    return rows.map(mapHotspotUser);
  }

  async getHotspotUser(name: string): Promise<HotspotUser | null> {
    const rows = await this.client.send(['/ip/hotspot/user/print', `?name=${name}`]);
    const row = rows[0];
    return row ? mapHotspotUser(row) : null;
  }

  async addHotspotUser(input: CreateHotspotUserInput): Promise<void> {
    const words = [
      '/ip/hotspot/user/add',
      `=name=${input.name}`,
      `=password=${input.password}`,
      `=profile=${input.profile}`,
    ];
    if (input.limitUptimeSeconds) words.push(`=limit-uptime=${toRouterOsDuration(input.limitUptimeSeconds)}`);
    if (input.limitBytesTotalBytes) words.push(`=limit-bytes-total=${input.limitBytesTotalBytes}`);
    if (input.comment) words.push(`=comment=${input.comment}`);
    if (input.server) words.push(`=server=${input.server}`);
    await this.client.send(words);
  }

  async updateHotspotUser(name: string, changes: Partial<CreateHotspotUserInput>): Promise<void> {
    const existing = await this.getHotspotUser(name);
    if (!existing) throw new RouterOsApiError(`hotspot user "${name}" does not exist on this router`, 'TRAP');
    const words = ['/ip/hotspot/user/set', `=.id=${existing.id}`];
    if (changes.password) words.push(`=password=${changes.password}`);
    if (changes.profile) words.push(`=profile=${changes.profile}`);
    if (changes.limitUptimeSeconds !== undefined) {
      words.push(`=limit-uptime=${changes.limitUptimeSeconds ? toRouterOsDuration(changes.limitUptimeSeconds) : '0s'}`);
    }
    if (changes.limitBytesTotalBytes !== undefined) {
      words.push(`=limit-bytes-total=${changes.limitBytesTotalBytes ?? 0}`);
    }
    if (changes.comment !== undefined) words.push(`=comment=${changes.comment}`);
    await this.client.send(words);
  }

  async setHotspotUserDisabled(name: string, disabled: boolean): Promise<void> {
    const existing = await this.getHotspotUser(name);
    if (!existing) return;
    await this.client.send([
      disabled ? '/ip/hotspot/user/disable' : '/ip/hotspot/user/enable',
      `=.id=${existing.id}`,
    ]);
  }

  async removeHotspotUser(name: string): Promise<void> {
    const existing = await this.getHotspotUser(name);
    if (!existing) return;
    await this.client.send(['/ip/hotspot/user/remove', `=.id=${existing.id}`]);
  }

  async listActive(): Promise<ActiveHotspotUser[]> {
    const rows = await this.client.send(['/ip/hotspot/active/print']);
    return rows.map((row) => ({
      id: row['.id'] ?? '',
      username: row.user ?? '',
      address: row.address,
      macAddress: row['mac-address'],
      uptimeSeconds: parseRouterOsDuration(row.uptime),
      sessionTimeLeftSeconds: parseRouterOsDuration(row['session-time-left']),
      bytesIn: toNumber(row['bytes-in']),
      bytesOut: toNumber(row['bytes-out']),
      loginBy: row['login-by'],
      server: row.server,
    }));
  }

  /** `activeId` is the `.id` from the same connection's listActive() call. */
  async disconnectActive(activeId: string): Promise<void> {
    await this.client.send(['/ip/hotspot/active/remove', `=.id=${activeId}`]);
  }

  async disconnectByUsername(username: string): Promise<boolean> {
    const active = await this.listActive();
    const match = active.find((entry) => entry.username === username);
    if (!match) return false;
    await this.disconnectActive(match.id);
    return true;
  }
}
