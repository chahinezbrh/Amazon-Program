import * as fs from 'fs';
import * as path from 'path';
import { CodeNotification } from '../../shared/types';

export class FuncManagerStore {
  private funcmanagerDir: string;
  private notificationsPath: string;
  private resolvedNotificationsPath: string;
  private lastShaPath: string;

  constructor(repoRoot: string) {
    this.funcmanagerDir = path.join(repoRoot, '.funcmanager');
    this.notificationsPath = path.join(this.funcmanagerDir, 'notifications.json');
    this.resolvedNotificationsPath = path.join(this.funcmanagerDir, 'resolvedNotifications.json');
    this.lastShaPath = path.join(this.funcmanagerDir, 'lastProcessedSha.json');

    if (!fs.existsSync(this.notificationsPath)) this.writeJson(this.notificationsPath, []);
    // resolvedNotifications.json is deliberately NOT created here — it should
    // only appear on disk the first time a notification is actually resolved.
  }

  getLastProcessedSha(): string | null {
    if (!fs.existsSync(this.lastShaPath)) return null;
    return this.readJson(this.lastShaPath).sha ?? null;
  }

  setLastProcessedSha(sha: string) {
    this.writeJson(this.lastShaPath, { sha });
  }

  private readJson(p: string): any {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  private writeJson(p: string, data: any) {
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  }

  getNotifications(): CodeNotification[] {
    return this.readJson(this.notificationsPath);
  }

  appendNotifications(newOnes: CodeNotification[]) {
    if (newOnes.length === 0) return;
    const existing = this.getNotifications();
    this.writeJson(this.notificationsPath, [...newOnes, ...existing]);
  }

  updateNotificationStatus(id: string, status: string) {
    const all = this.getNotifications();
    const updated = all.map((n) => (n.id === id ? { ...n, status } : n));
    this.writeJson(this.notificationsPath, updated);
  }

  /** Returns [] without touching disk if resolvedNotifications.json doesn't
   *  exist yet — avoids creating it just from a read. */
  getResolvedNotifications(): CodeNotification[] {
    if (!fs.existsSync(this.resolvedNotificationsPath)) return [];
    return this.readJson(this.resolvedNotificationsPath);
  }

  /**
   * Removes a notification from notifications.json and prepends it (marked
   * resolved) to resolvedNotifications.json — creating that file for the
   * first time here, on the first ever resolve, not before.
   *
   * Returns null if no notification with that id exists in the active list,
   * so the caller can skip re-broadcasting data on a no-op.
   */
  resolveNotification(id: string): CodeNotification | null {
  const active = this.getNotifications();
  const index = active.findIndex((n) => n.id === id);
  if (index === -1) return null;

  const [resolved] = active.splice(index, 1);
  if (!resolved) return null; // defensive: splice(index, 1) at a valid index
                               // always returns one element, but this guard
                               // lets TS narrow `resolved` from possibly-
                               // undefined to CodeNotification before spreading

  const resolvedEntry: CodeNotification = { ...resolved, status: 'resolved' };

  this.writeJson(this.notificationsPath, active);

  const resolvedList = this.getResolvedNotifications();
  this.writeJson(this.resolvedNotificationsPath, [resolvedEntry, ...resolvedList]);

  return resolvedEntry;
}
}