"use strict";
// src/backend/services/githubAuth.ts
//
// Gets a GitHub token with repo-admin scope (needed to register webhooks),
// either from SecretStorage if already stored, or by prompting the user once.
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
exports.getOrPromptGithubToken = getOrPromptGithubToken;
const vscode = __importStar(require("vscode"));
const SECRET_KEY = 'funcmanager.githubToken';
// src/backend/services/githubAuth.ts
async function getOrPromptGithubToken(context, repoUrl) {
    const secretKey = `funcmanager.githubToken.${repoUrl.trim().toLowerCase()}`;
    const existing = await context.secrets.get(secretKey);
    if (existing)
        return existing;
    const token = await vscode.window.showInputBox({
        title: 'GitHub Personal Access Token',
        prompt: `FuncManager needs a token with the "admin:repo_hook" scope for ${repoUrl}. ` +
            'Generate one at https://github.com/settings/tokens and paste it here.',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim().length === 0 ? 'Token cannot be empty' : undefined),
    });
    if (!token)
        return undefined;
    await context.secrets.store(secretKey, token.trim());
    return token.trim();
}
