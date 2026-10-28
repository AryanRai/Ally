import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** The original Codex home; every profile shares its chat history so a chat can move between accounts. */
export const sharedCodexHome = () => {
  const inherited = process.env.CODEX_HOME;
  // Ally may itself be launched from a turn running in a private account profile.
  // That profile must never become the shared destination for all accounts.
  return inherited && !/[\\/]codex-profiles[\\/][0-9a-f-]{36}[\\/]?$/i.test(path.resolve(inherited))
    ? inherited : path.join(os.homedir(), '.codex');
};
const sameDir = (a: string, b: string) => path.resolve(a.replace(/^\\\\\?\\/, '')).replace(/[\\/]+$/, '').toLowerCase() === path.resolve(b).replace(/[\\/]+$/, '').toLowerCase();
const canonicalDir = (directory: string): string => {
  const resolved = path.resolve(directory);
  try { return fs.realpathSync(resolved); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('Cannot resolve Codex history directories safely. No history was changed.');
    const parent = path.dirname(resolved);
    return parent === resolved ? resolved : path.join(canonicalDir(parent), path.basename(resolved));
  }
};

/**
 * Points a profile's history folders at the shared home with junctions (no credentials move).
 * A profile's own earlier history is merged in once and its old folder kept beside it.
 * config.toml/AGENTS.md are copied so the same tools and instructions follow the chat.
 */
export function shareCodexHistory(home: string, shared = sharedCodexHome()) {
  if (sameDir(home, shared)) throw Error('A Codex account profile cannot be its own shared history home.');
  if (sameDir(canonicalDir(home), canonicalDir(shared))) throw Error('A Codex account profile cannot be its own shared history home (directory alias).');
  fs.mkdirSync(home, { recursive: true });
  for (const dir of ['sessions', 'archived_sessions']) {
    const target = path.join(shared, dir), link = path.join(home, dir);
    fs.mkdirSync(target, { recursive: true });
    let stat: fs.Stats | undefined;
    try { stat = fs.lstatSync(link); } catch { /* missing */ }
    if (stat?.isSymbolicLink()) {
      if (sameDir(fs.readlinkSync(link), target)) continue;
      fs.unlinkSync(link);
    } else if (stat?.isDirectory()) {
      fs.cpSync(link, target, { recursive: true, force: false, errorOnExist: false });
      fs.renameSync(link, `${link}.isolated-${Date.now()}`);
    }
    fs.symlinkSync(target, link, 'junction');
  }
  for (const file of ['config.toml', 'AGENTS.md']) {
    const source = path.join(shared, file), copy = path.join(home, file);
    try {
      const from = fs.statSync(source);
      let to: fs.Stats | undefined; try { to = fs.statSync(copy); } catch { /* missing */ }
      if (!to || to.mtimeMs < from.mtimeMs) fs.copyFileSync(source, copy);
    } catch { /* optional shared file */ }
  }
}

export const DEFAULT_CODEX_ACCOUNT = 'default';
export interface CodexAccount { id: string; label: string }
export interface CodexAccountStatus {
  id: string;
  checkedAt: number;
  state: 'unknown' | 'signed_out' | 'ready' | 'limited' | 'unavailable';
  email?: string;
  plan?: string;
  windows: Array<{ name: string; usedPercent: number; resetsAt?: number }>;
  message?: string;
}
export interface CodexAccountsSnapshot { accounts: CodexAccount[]; selected: string; status: Record<string, CodexAccountStatus>; signingIn?: string; autoSwitch?: boolean }
type State = { version: 1; accounts: CodexAccount[]; selected: string; affinity: Record<string, string>; identities: Record<string, string>; status: Record<string, CodexAccountStatus>; autoSwitch?: boolean };
/** A limit with no reported reset is retried after this long; a fresh rejection simply moves on again. */
const LIMIT_RETRY_MS = 30 * 60_000;
const initial = (): State => ({ version: 1, accounts: [], selected: 'default', affinity: {}, identities: {}, status: {} });
const validId = (id: unknown): id is string => typeof id === 'string' && (id === 'default' || /^[0-9a-f-]{36}$/.test(id));
const validThread = (id: string) => /^[\w-]{1,200}$/.test(id);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Metadata only. Codex owns credentials inside each dedicated CODEX_HOME. */
export class CodexAccounts {
  private state = initial();
  private configured = false;
  private file?: string;
  configure(file: string) {
    let state = initial();
    try {
      state = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (state.version !== 1 || !Array.isArray(state.accounts) || state.accounts.length > 20 ||
          state.accounts.some(a => !validId(a.id) || a.id === 'default' || typeof a.label !== 'string' || !a.label.trim() || a.label.length > 80) ||
          new Set(state.accounts.map(a => a.id)).size !== state.accounts.length ||
          !record(state.affinity) || !record(state.identities) || !record(state.status) ||
          Object.keys(state.affinity).some(id => !validThread(id)) ||
          Object.values(state.identities).some(value => typeof value !== 'string' || !value || value.length > 320) ||
          Object.values(state.status).some(value => !record(value) || !validId(value.id) || !Number.isFinite(value.checkedAt) ||
            !['unknown', 'signed_out', 'ready', 'limited', 'unavailable'].includes(String(value.state)) || !Array.isArray(value.windows)) ||
          ![...Object.values(state.affinity), state.selected].every(id => id === 'default' || state.accounts.some(a => a.id === id))) throw Error('Invalid profile metadata');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('Cannot read Codex account profiles. Restore the profile metadata before sending; no account was substituted.');
    }
    this.file = file; this.state = state; this.configured = true;
  }
  private save(next: State) {
    if (!this.file) throw Error('Account profiles are not initialized.');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
    this.state = next;
  }
  list(): CodexAccount[] { return [{ id: 'default', label: 'Existing Codex login' }, ...this.state.accounts.map(a => ({ ...a }))]; }
  snapshot() { return { accounts: this.list(), selected: this.state.selected, status: structuredClone(this.state.status), autoSwitch: this.autoSwitch() }; }
  autoSwitch() { return this.state.autoSwitch !== false; }
  setAutoSwitch(on: boolean) { this.save({ ...this.state, autoSwitch: !!on }); }
  /** Signed in, not mid sign-in, and not limited (or its limit has reset). */
  available(id: string, now = Date.now()) {
    if (!this.list().some(a => a.id === id) || logins.has(id)) return false;
    // Identity is verified at the start of each turn; an unchecked profile is still usable.
    const status = this.state.status[id];
    if (status?.state === 'signed_out') return false;
    if (status?.state !== 'limited') return true;
    // Only exhausted windows block; a weekly window at 63% must not hold an account whose 5-hour window reset.
    // Resets that predate the observation are stale (the limit was hit again since), so wait the retry period instead.
    const resets = status.windows.filter(w => w.usedPercent >= 100).map(w => w.resetsAt)
      .filter((t): t is number => Number.isFinite(t) && t! > status.checkedAt);
    return resets.length ? Math.max(...resets) <= now : now - status.checkedAt > LIMIT_RETRY_MS;
  }
  /** The next available account after those already tried, in Settings order. */
  next(tried: Set<string>, now = Date.now()) {
    return this.list().map(a => a.id).find(id => !tried.has(id) && this.available(id, now));
  }
  label(id: string) { return this.list().find(a => a.id === id)?.label ?? 'another account'; }
  require(id: string) {
    if (!validId(id) || !this.list().some(a => a.id === id)) throw Error('This Codex account profile is unavailable. Select a profile explicitly; your draft is kept.');
    return id;
  }
  add(label: string) {
    if (typeof label !== 'string' || !label.trim() || label.trim().length > 80 || this.state.accounts.length >= 20) throw Error('Enter an account label (1–80 characters; up to 20 profiles).');
    const account = { id: randomUUID(), label: label.trim() };
    this.save({ ...this.state, accounts: [...this.state.accounts, account] });
    return account;
  }
  remove(id: string) {
    this.require(id);
    if (uses.get(id) || logins.has(id)) throw Error('Finish this profile’s active replies or sign-in first.');
    if (id === 'default' || this.state.selected === id || Object.values(this.state.affinity).includes(id)) throw Error('Keep profiles used by chats or selected for new chats. Credentials and native history are never deleted here.');
    const status = { ...this.state.status }; delete status[id];
    const identities = { ...this.state.identities }; delete identities[id];
    this.save({ ...this.state, accounts: this.state.accounts.filter(a => a.id !== id), identities, status });
  }
  select(id: string) { this.require(id); this.save({ ...this.state, selected: id }); }
  owner(thread: string): string | undefined { return this.state.affinity[thread]; }
  /** Records the account a chat last ran on; history is shared, so a chat may move accounts. */
  bind(thread: string, id: string) {
    this.require(id);
    if (!validThread(thread)) throw Error('Invalid Codex thread');
    if (this.owner(thread) !== id && this.configured) this.save({ ...this.state, affinity: { ...this.state.affinity, [thread]: id } });
  }
  /** Directory listings only fill in unknown chats; they never move a chat's account. */
  bindMany(threads: string[], id: string) {
    this.require(id);
    const affinity = { ...this.state.affinity };
    let changed = false;
    for (const thread of threads) {
      if (!validThread(thread)) throw Error('Invalid Codex thread');
      if (!this.owner(thread)) { affinity[thread] = id; changed = true; }
    }
    if (changed && this.configured) this.save({ ...this.state, affinity });
  }
  /**
   * An explicit choice wins. Otherwise a chat stays on the account it last used (unclassified
   * chats on the original login; new chats on the selection), moving on automatically when
   * that account is limited.
   */
  route(thread?: string, requested?: string): string {
    if (requested) return this.require(requested);
    const preferred = this.require(thread ? this.owner(thread) ?? 'default' : this.state.selected);
    if (this.autoSwitch() && !this.available(preferred)) return this.next(new Set([preferred])) ?? preferred;
    return preferred;
  }
  private shared = new Set<string>();
  home(id: string): string | undefined {
    this.require(id);
    if (id === 'default') return undefined;
    if (!this.file) throw Error('Account profiles are not initialized.');
    const home = path.join(path.dirname(this.file), 'codex-profiles', id);
    if (!this.shared.has(home)) { shareCodexHistory(home); this.shared.add(home); }
    return home;
  }
  verifyIdentity(id: string, email: string) {
    this.require(id);
    if (!email || email.length > 320) throw Error('Codex did not report a ChatGPT account identity.');
    const identity = email.toLowerCase();
    const prior = this.state.identities[id];
    if (prior && prior !== identity) throw Error('This profile is signed into a different account. Sign back into its original account or add a new profile. Its chats were not moved.');
    if (this.configured && !prior) this.save({ ...this.state, identities: { ...this.state.identities, [id]: identity } });
  }
  observe(status: CodexAccountStatus) {
    this.require(status.id);
    if (this.configured) this.save({ ...this.state, status: { ...this.state.status, [status.id]: status } });
  }
  limited(id: string) {
    const prior = this.state.status[id];
    this.observe({ ...prior, id, state: 'limited', checkedAt: Date.now(), windows: prior?.windows ?? [],
      message: this.autoSwitch() ? 'Codex reported a usage limit. Ally moves chats to your next available account until it resets.' : 'Codex reported a usage limit. Automatic switching is off; choose another account or wait for its reset.' });
  }
}

/** Only structured provider usage errors inform delivery; matching free text never authorizes replay. */
export function structuredUsageLimit(value: unknown): boolean {
  return value === 'UsageLimitExceeded' || value === 'usageLimitExceeded';
}

/** A percentage is advisory (other buckets/credits may apply). Only an explicit
 * service-classified limit on the primary view can stop before submission. */
export function providerReportsLimit(result: any): boolean {
  return typeof result?.rateLimits?.rateLimitReachedType === 'string' && !!result.rateLimits.rateLimitReachedType;
}

export const codexAccounts = new CodexAccounts();

const uses = new Map<string, number>();
const logins = new Set<string>();
export function useCodexProfile(id: string): () => void {
  if (logins.has(id)) throw Error('Finish or cancel this profile’s sign-in before sending. Nothing was sent.');
  uses.set(id, (uses.get(id) ?? 0) + 1);
  let released = false;
  return () => { if (!released) { released = true; uses.set(id, Math.max(0, (uses.get(id) ?? 1) - 1)); } };
}
export function loginCodexProfile(id: string): () => void {
  if (logins.size || uses.get(id)) throw Error('Finish this account’s active replies and any sign-in first.');
  logins.add(id);
  return () => { logins.delete(id); };
}

/** Remove inherited alternate credentials rather than accidentally using them in a profile. */
/**
 * Credentials stay in the profile's own CODEX_HOME. Codex's databases (including which session file
 * is the current one for each chat) are shared with the original home, so every account continues the
 * same chat instead of splitting it into separate copies.
 */
export function codexProfileEnvironment(base: NodeJS.ProcessEnv, home: string, shared = sharedCodexHome()): NodeJS.ProcessEnv {
  const env = { ...base };
  for (const key of Object.keys(env)) if (/^(CODEX_HOME|CODEX_SQLITE_HOME|OPENAI_BASE_URL|OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN|OPENAI_IDENTITY_TOKEN_FILE|OPENAI_IDENTITY_TOKEN|OPENAI_IDENTITY_PROVIDER_ID|OPENAI_SERVICE_ACCOUNT_ID)$/i.test(key)) delete env[key];
  env.CODEX_HOME = home;
  env.CODEX_SQLITE_HOME = shared;
  return env;
}

export function accountWindows(result: any): CodexAccountStatus['windows'] {
  const limits = result?.rateLimitsByLimitId ? Object.values(result.rateLimitsByLimitId) : [result?.rateLimits];
  return limits.flatMap((limit: any) => ['primary', 'secondary'].flatMap(name => {
    const w = limit?.[name];
    if (!Number.isFinite(w?.usedPercent) || w.usedPercent < 0 || w.usedPercent > 100) return [];
    return [{ name: `${typeof limit.limitId === 'string' ? limit.limitId.slice(0, 80) : 'Codex'} ${name}`, usedPercent: w.usedPercent,
      ...(Number.isFinite(w.resetsAt) && w.resetsAt > 0 && w.resetsAt < 8640000000000 ? { resetsAt: w.resetsAt * 1000 } : {}) }];
  }));
}
