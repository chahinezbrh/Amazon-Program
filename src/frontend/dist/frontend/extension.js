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
const FunctionHoverProvider_1 = require("./providers/FunctionHoverProvider");
const DocPanelProvider_1 = require("./providers/DocPanelProvider");
const sideBarProvider_1 = require("./providers/sideBarProvider");
const playMemoryProvider_1 = require("./providers/playMemoryProvider");
function activate(context) {
    const hoverProvider = new FunctionHoverProvider_1.FunctionHoverProvider(context);
    const testPopupCommand = vscode.commands.registerCommand('yourExtension.testPopup', () => {
        hoverProvider.showForFunction('authenticateUser', 'src/auth/middleware.js');
    });
    const testDocPanelCommand = vscode.commands.registerCommand('yourExtension.testDocPanel', () => {
        const mockMeta = {
            symbolName: 'authenticateUser',
            filePath: 'src/auth/middleware.js',
            startLine: 10,
            endLine: 25,
        };
        DocPanelProvider_1.DocPanelProvider.show(context.extensionUri, mockMeta);
        // simulate the async doc-entries lookup resolving shortly after the panel opens
        setTimeout(() => {
            const mockEntries = [
                {
                    id: '1',
                    kind: 'written',
                    content: 'This function checks the user session token and returns the authenticated user.',
                    createdAt: new Date().toISOString(),
                },
                {
                    id: '2',
                    kind: 'ai',
                    content: 'AI-generated summary: validates a bearer token against the session store.',
                    createdAt: new Date().toISOString(),
                },
                {
                    id: '3',
                    kind: 'voice',
                    audioPath: 'C:\\path\\to\\some\\recording.mp3',
                    createdAt: new Date().toISOString(),
                },
            ];
            DocPanelProvider_1.DocPanelProvider.currentPanel?.updateEntries(mockEntries);
        }, 500);
    });
    const sideBarProvider = new sideBarProvider_1.SideBarProvider(context.extensionUri);
    const sideBarView = vscode.window.registerWebviewViewProvider(sideBarProvider_1.SideBarProvider.viewId, sideBarProvider);
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
    context.subscriptions.push(testPopupCommand, testDocPanelCommand, sideBarView, testSideBarCommand, testPlayMemoryCommand);
}
function deactivate() { }
