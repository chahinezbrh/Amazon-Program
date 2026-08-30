import * as fs from 'fs';
import * as path from 'path';
import { CodeNotification } from '../../shared/types';

export class FuncManagerStore {
  private funcmanagerDir: string;
  private notificationsPath: string;

  private lastShaPath: string;

  constructor(repoRoot: string) {
    this.funcmanagerDir = path.join(repoRoot, '.funcmanager');
    this.notificationsPath = path.join(this.funcmanagerDir, 'notifications.json');
    this.lastShaPath = path.join(this.funcmanagerDir, 'lastProcessedSha.json');
    if (!fs.existsSync(this.notificationsPath)) this.writeJson(this.notificationsPath, []);
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
}