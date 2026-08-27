"use strict";
// src/frontend/providers/notificationsBellProvider.ts
//
// Backs the bell icon's view (amazonProgram.notificationsView). It never
// shows real content — every time it BECOMES VISIBLE (not just the first
// time it's created), it opens the real Notification Center editor panel
// and closes the sidebar again. resolveWebviewView only fires once per
// session, so onDidChangeVisibility is what makes this work on every
// reopen, not just the first click.
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
exports.NotificationsBellProvider = void 0;
const vscode = __importStar(require("vscode"));
class NotificationsBellProvider {
    resolveWebviewView(webviewView) {
        console.log('[NotificationsBellProvider] resolveWebviewView called');
        webviewView.webview.options = { enableScripts: false };
        webviewView.webview.html = `<!DOCTYPE html><html><body></body></html>`;
        const trigger = () => {
            if (!webviewView.visible)
                return; // only act when it's actually being shown, not hidden
            console.log('[NotificationsBellProvider] view became visible, opening Notification Center');
            vscode.commands.executeCommand('yourExtension.showNotificationCenter', 'all');
            setTimeout(() => {
                vscode.commands.executeCommand('workbench.action.closeSidebar');
            }, 50);
        };
        webviewView.onDidChangeVisibility(trigger);
        // Handle the very first resolve too, since resolveWebviewView itself
        // means it's visible right now.
        trigger();
    }
}
exports.NotificationsBellProvider = NotificationsBellProvider;
