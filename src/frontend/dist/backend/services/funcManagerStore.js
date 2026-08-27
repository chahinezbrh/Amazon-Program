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
        this.lastShaPath = path.join(this.funcmanagerDir, 'lastProcessedSha.json');
        if (!fs.existsSync(this.notificationsPath))
            this.writeJson(this.notificationsPath, []);
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
}
exports.FuncManagerStore = FuncManagerStore;
