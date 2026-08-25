import * as fs from 'fs';
import * as path from 'path';
import { CodeNotification } from '../../shared/types';

export class FuncManagerStore {
  private funcmanagerDir: string;
  private functionsPath: string;
  private notificationsPath: string;

  constructor(workspaceRoot: string) {
    this.funcmanagerDir = path.join(workspaceRoot, '.funcmanager');
    this.functionsPath = path.join(this.funcmanagerDir, 'functions.json');
    this.notificationsPath = path.join(this.funcmanagerDir, 'notifications.json');
    if (!fs.existsSync(this.functionsPath)) this.writeJson(this.functionsPath, {});
    if (!fs.existsSync(this.notificationsPath)) this.writeJson(this.notificationsPath, []);
  }

  private readJson(p: string): any {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  private writeJson(p: string, data: any) {
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  }

  getFunctionHashes(filePath: string): Record<string, string> {
    const all = this.readJson(this.functionsPath);
    return all[filePath] ?? {};
  }

  setFunctionHashes(filePath: string, hashes: Record<string, string>) {
    const all = this.readJson(this.functionsPath);
    all[filePath] = hashes;
    this.writeJson(this.functionsPath, all);
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