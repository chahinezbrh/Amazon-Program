"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuncManagerStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class FuncManagerStore {
    constructor(repoRoot) {
        this.funcmanagerDir = path.join(repoRoot, '.funcmanager');
        this.notificationsPath = path.join(this.funcmanagerDir, 'notifications.json');
        this.resolvedNotificationsPath = path.join(this.funcmanagerDir, 'resolvedNotifications.json');
        this.lastShaPath = path.join(this.funcmanagerDir, 'lastProcessedSha.json');
        if (!fs.existsSync(this.notificationsPath))
            this.writeJson(this.notificationsPath, []);
        // resolvedNotifications.json is deliberately NOT created here — it should
        // only appear on disk the first time a notification is actually resolved.
    }
    getLastProcessedSha() {
        if (!fs.existsSync(this.lastShaPath))
            return null;
        return this.readJson(this.lastShaPath).sha ?? null;
    }
    setLastProcessedSha(sha) {
        this.writeJson(this.lastShaPath, { sha });
    }
    readJson(p) {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
    writeJson(p, data) {
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
    }
    getNotifications() {
        return this.readJson(this.notificationsPath);
    }
    appendNotifications(newOnes) {
        if (newOnes.length === 0)
            return;
        const existing = this.getNotifications();
        this.writeJson(this.notificationsPath, [...newOnes, ...existing]);
    }
    updateNotificationStatus(id, status) {
        const all = this.getNotifications();
        const updated = all.map((n) => (n.id === id ? { ...n, status } : n));
        this.writeJson(this.notificationsPath, updated);
    }
    /** Returns [] without touching disk if resolvedNotifications.json doesn't
     *  exist yet — avoids creating it just from a read. */
    getResolvedNotifications() {
        if (!fs.existsSync(this.resolvedNotificationsPath))
            return [];
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
    resolveNotification(id) {
        const active = this.getNotifications();
        const index = active.findIndex((n) => n.id === id);
        if (index === -1)
            return null;
        const [resolved] = active.splice(index, 1);
        if (!resolved)
            return null; // defensive: splice(index, 1) at a valid index
        // always returns one element, but this guard
        // lets TS narrow `resolved` from possibly-
        // undefined to CodeNotification before spreading
        const resolvedEntry = { ...resolved, status: 'resolved' };
        this.writeJson(this.notificationsPath, active);
        const resolvedList = this.getResolvedNotifications();
        this.writeJson(this.resolvedNotificationsPath, [resolvedEntry, ...resolvedList]);
        return resolvedEntry;
    }
}
exports.FuncManagerStore = FuncManagerStore;
