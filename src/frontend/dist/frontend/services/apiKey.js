"use strict";
// src/frontend/services/apiKey.ts
//
// Holds the Gemini API key in VS Code's SecretStorage, which is encrypted per
// machine. A key in settings.json would be committed with the repo and leak —
// especially in workspace settings.
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
exports.initSecrets = initSecrets;
exports.getApiKey = getApiKey;
exports.promptForApiKey = promptForApiKey;
exports.requireApiKey = requireApiKey;
exports.clearApiKey = clearApiKey;
const vscode = __importStar(require("vscode"));
const KEY = 'docManager.geminiApiKey';
let secrets;
/** Called once from activate(). SecretStorage is only reachable through the
 *  extension context, which commands don't otherwise receive. */
function initSecrets(context) {
    secrets = context.secrets;
}
async function getApiKey() {
    return secrets?.get(KEY);
}
/** Prompts for a key and stores it. Returns undefined if the user cancels. */
async function promptForApiKey() {
    const value = await vscode.window.showInputBox({
        title: 'Gemini API key',
        prompt: 'Stored in VS Code secret storage, not in your settings file.',
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'AIza…',
        validateInput: (input) => input.trim().length < 20 ? "That doesn't look like an API key." : null,
    });
    if (!value)
        return undefined;
    await secrets?.store(KEY, value.trim());
    return value.trim();
}
/** The key if stored, otherwise asks for one. Used at the point of need so a
 *  first-time user isn't prompted during activation. */
async function requireApiKey() {
    return (await getApiKey()) ?? (await promptForApiKey());
}
async function clearApiKey() {
    await secrets?.delete(KEY);
    vscode.window.showInformationMessage('Doc Manager: Gemini API key removed.');
}
