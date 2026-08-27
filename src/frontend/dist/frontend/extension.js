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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const hoverProvider_1 = require("./providers/hoverProvider");
const DocPanelProvider_1 = require("./providers/DocPanelProvider");
const sideBarProvider_1 = require("./providers/sideBarProvider");
const playMemoryProvider_1 = require("./providers/playMemoryProvider");
const modificationNotifProvider_1 = require("./providers/modificationNotifProvider");
const connectRepoProvider_1 = require("./providers/connectRepoProvider");
const recordPanelProvider_1 = require("./providers/recordPanelProvider");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("../backend/config");
const webhookClient_1 = require("../backend/services/webhookClient");
const commitProcessor_1 = require("../backend/services/commitProcessor");
const funcManagerStore_1 = require("../backend/services/funcManagerStore");
const notificationsBellProvider_1 = require("./providers/notificationsBellProvider");
function activate(context) {
    const hoverProvider = new hoverProvider_1.HoverProvider(context);
    // Register hover provider for all files
    const hoverRegistration = vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider);
    connectRepoProvider_1.ConnectRepoProvider.checkAndPrompt(context);
    const connectRepoCommand = vscode.commands.registerCommand('yourExtension.connectRepo', () => {
        connectRepoProvider_1.ConnectRepoProvider.show(context);
    });
    const testConnectRepoCommand = vscode.commands.registerCommand('yourExtension.testConnectRepo', () => {
        connectRepoProvider_1.ConnectRepoProvider.show(context);
    });
    const showFunctionPopupCommand = vscode.commands.registerCommand('yourExtension.showFunctionPopup', (meta) => {
        hoverProvider.showForFunction(meta.symbolName, meta.filePath, meta.startLine, meta.endLine);
    });
    const testPopupCommand = vscode.commands.registerCommand('yourExtension.testPopup', () => {
        hoverProvider.showForFunction('authenticateUser', 'src/auth/middleware.js');
    });
    const showDocPanelCommand = vscode.commands.registerCommand('docManager.showDocPanel', (meta) => {
        DocPanelProvider_1.DocPanelProvider.show(context.extensionUri, meta);
    });
    const openFullDocsCommand = vscode.commands.registerCommand('docManager.openFullDocs', (meta) => {
        DocPanelProvider_1.DocPanelProvider.show(context.extensionUri, meta);
    });
    const testDocPanelCommand = vscode.commands.registerCommand('yourExtension.testDocPanel', () => {
        const mockMeta = {
            symbolName: 'authenticateUser',
            filePath: 'src/auth/middleware.js',
            startLine: 10,
            endLine: 25,
        };
        DocPanelProvider_1.DocPanelProvider.show(context.extensionUri, mockMeta);
        setTimeout(() => {
            const mockEntries = [
                {
                    id: '1',
                    type: 'written',
                    content: 'This function checks the user session token and returns the authenticated user.',
                    author: 'Unknown',
                    createdAt: new Date().toISOString(),
                    symbolName: mockMeta.symbolName,
                    filePath: mockMeta.filePath,
                    startLine: mockMeta.startLine,
                    endLine: mockMeta.endLine,
                    isStale: false,
                },
                {
                    id: '2',
                    type: 'ai',
                    content: 'AI-generated summary: validates a bearer token against the session store.',
                    author: 'Unknown',
                    createdAt: new Date().toISOString(),
                    symbolName: mockMeta.symbolName,
                    filePath: mockMeta.filePath,
                    startLine: mockMeta.startLine,
                    endLine: mockMeta.endLine,
                    isStale: false,
                },
                {
                    id: '3',
                    type: 'voice',
                    audioPath: 'C:\\path\\to\\some\\recording.mp3',
                    author: 'Unknown',
                    createdAt: new Date().toISOString(),
                    symbolName: mockMeta.symbolName,
                    filePath: mockMeta.filePath,
                    startLine: mockMeta.startLine,
                    endLine: mockMeta.endLine,
                    isStale: false,
                },
            ];
            DocPanelProvider_1.DocPanelProvider.currentPanel?.updateEntries(mockEntries);
        }, 500);
    });
    const recordDocCommand = vscode.commands.registerCommand('yourExtension.recordDoc', (meta) => {
        recordPanelProvider_1.RecordPanelProvider.show(context.extensionUri, meta);
    });
    const docManagerRecordDocCommand = vscode.commands.registerCommand('docManager.recordDoc', (meta) => {
        recordPanelProvider_1.RecordPanelProvider.show(context.extensionUri, meta);
    });
    const docManagerAddMemoryCommand = vscode.commands.registerCommand('docManager.addMemory', (meta) => {
        recordPanelProvider_1.RecordPanelProvider.show(context.extensionUri, meta);
    });
    const docManagerAiDocsCommand = vscode.commands.registerCommand('docManager.aiDocs', (meta) => {
        vscode.window.showInformationMessage(`AI Documentation requested for ${meta?.symbolName || 'symbol'}.`);
    });
    const docManagerWriteDocsCommand = vscode.commands.registerCommand('docManager.writeDocs', (meta) => {
        if (meta) {
            DocPanelProvider_1.DocPanelProvider.show(context.extensionUri, meta);
        }
    });
    const docManagerPlayVoiceCommand = vscode.commands.registerCommand('docManager.playVoice', (meta) => {
        playMemoryProvider_1.PlayMemoryProvider.show(context.extensionUri, {
            functionName: meta?.symbolName || 'Function',
            filePath: meta?.filePath || '',
            durationSec: 47,
            transcript: 'Voice documentation recording.',
        });
    });
    const testRecordDocCommand = vscode.commands.registerCommand('yourExtension.testRecordDoc', () => {
        const mockMeta = {
            symbolName: 'authenticateUser',
            filePath: 'src/auth/middleware.js',
            startLine: 10,
            endLine: 25,
        };
        recordPanelProvider_1.RecordPanelProvider.show(context.extensionUri, mockMeta);
    });
    const sideBarProvider = new sideBarProvider_1.SideBarProvider(context.extensionUri);
    const sideBarView = vscode.window.registerWebviewViewProvider(sideBarProvider_1.SideBarProvider.viewId, sideBarProvider);
    const notificationsBellProvider = new notificationsBellProvider_1.NotificationsBellProvider();
    const notificationsBellView = vscode.window.registerWebviewViewProvider('amazonProgram.notificationsView', notificationsBellProvider);
    const testSideBarCommand = vscode.commands.registerCommand('yourExtension.testSideBar', () => {
        vscode.commands.executeCommand(`${sideBarProvider_1.SideBarProvider.viewId}.focus`);
    });
    const testPlayMemoryCommand = vscode.commands.registerCommand('yourExtension.testPlayMemory', () => {
        playMemoryProvider_1.PlayMemoryProvider.show(context.extensionUri, {
            functionName: 'authenticateUser',
            filePath: 'src/auth/middleware.js',
            durationSec: 47,
            transcript: 'This function checks whether the incoming request has a valid session token before allowing access.',
        });
    });
    const showNotifCenterCommand = vscode.commands.registerCommand('yourExtension.showNotificationCenter', (filter) => {
        modificationNotifProvider_1.ModificationNotifProvider.show(context.extensionUri, filter || 'all');
    });
    const testModificationNotifCommand = vscode.commands.registerCommand('yourExtension.testModificationNotif', () => {
        modificationNotifProvider_1.ModificationNotifProvider.show(context.extensionUri, 'all');
    });
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const repoRoot = workspaceFolders[0].uri.fsPath;
        const configPath = path.join(repoRoot, '.funcmanager', 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.repoUrl) {
                const store = new funcManagerStore_1.FuncManagerStore(repoRoot);
                const webhookClient = new webhookClient_1.WebhookClientService(config.repoUrl, config_1.RELAY_WS_URL);
                webhookClient.on('push', async (payload) => {
                    console.log(`[extension] push event received for ${repoRoot}`);
                    try {
                        const notifications = await (0, commitProcessor_1.handlePushWebhook)(repoRoot, payload.head_commit?.author?.name ?? 'Unknown', payload.head_commit?.message ?? '');
                        console.log(`[extension] handlePushWebhook returned ${notifications.length} notifications`);
                        if (notifications.length > 0) {
                            store.appendNotifications(notifications);
                            if (modificationNotifProvider_1.ModificationNotifProvider.currentPanel) {
                                modificationNotifProvider_1.ModificationNotifProvider.currentPanel.updateNotifications(store.getNotifications());
                            }
                        }
                    }
                    catch (err) {
                        console.log(`[extension] handlePushWebhook threw: ${err.message}`);
                        vscode.window.showErrorMessage(`Failed to process incoming commit: ${err.message}`);
                    }
                });
                webhookClient.connect();
                context.subscriptions.push({ dispose: () => webhookClient.dispose() });
            }
        }
    }
    context.subscriptions.push(hoverRegistration, connectRepoCommand, testConnectRepoCommand, showFunctionPopupCommand, testPopupCommand, showDocPanelCommand, openFullDocsCommand, testDocPanelCommand, recordDocCommand, docManagerRecordDocCommand, docManagerAddMemoryCommand, docManagerAiDocsCommand, docManagerWriteDocsCommand, docManagerPlayVoiceCommand, testRecordDocCommand, sideBarView, notificationsBellView, testSideBarCommand, testPlayMemoryCommand, showNotifCenterCommand, testModificationNotifCommand);
    setTimeout(() => {
        vscode.commands.executeCommand(`${sideBarProvider_1.SideBarProvider.viewId}.focus`).then(undefined, () => { });
    }, 300);
}
function deactivate() { }
