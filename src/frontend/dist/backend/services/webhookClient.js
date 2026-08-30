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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookClientService = void 0;
const vscode = __importStar(require("vscode")); // if u get an error regarding this run npm install --save-dev @types/vscode --legacy-peer-deps
const ws_1 = __importDefault(require("ws")); //npm install ws
const events_1 = require("events"); //npm install events
class WebhookClientService extends events_1.EventEmitter {
    constructor(repoUrl, relayUrl) {
        super();
        this.reconnectDelay = 2000;
        this.repoUrl = repoUrl;
        this.relayUrl = relayUrl;
    }
    connect() {
        console.log('[WebhookClient] connect() called, relayUrl:', this.relayUrl);
        this.ws = new ws_1.default(`${this.relayUrl}`);
        console.log('[WebhookClient] WebSocket object created');
        this.ws.on('open', () => {
            console.log(`[WebhookClient] connected, registering for ${this.repoUrl}`);
            this.ws?.send(JSON.stringify({ type: 'register', repoUrl: this.repoUrl }));
        });
        this.ws.on('message', (raw) => {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'push') {
                this.emit('push', msg.data);
            }
        });
        this.ws.on('close', (code, reason) => {
            console.log('[WebhookClient] connection closed. Code:', code, 'Reason:', reason?.toString());
            setTimeout(() => this.connect(), this.reconnectDelay);
        });
        this.ws.on('error', (err) => {
            console.log('[WebhookClient] connection error:', err.message);
            vscode.window.showErrorMessage(`Webhook relay connection error: ${err.message}`);
        });
    }
    dispose() {
        this.ws?.close();
    }
}
exports.WebhookClientService = WebhookClientService;
