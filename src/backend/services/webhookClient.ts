import * as vscode from 'vscode'; // if u get an error regarding this run npm install --save-dev @types/vscode --legacy-peer-deps
import WebSocket from 'ws'; //npm install ws
import { EventEmitter } from 'events'; //npm install events

export class WebhookClientService extends EventEmitter {
  private ws: WebSocket | undefined;
  private repoUrl: string;
  private relayUrl: string;
  private reconnectDelay = 2000;

  constructor(repoUrl: string, relayUrl: string) {
    super();
    this.repoUrl = repoUrl;
    this.relayUrl = relayUrl;
  }

  connect() {
    console.log('[WebhookClient] connect() called, relayUrl:', this.relayUrl);
    this.ws = new WebSocket(`${this.relayUrl}`);
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