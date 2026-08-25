import * as vscode from 'vscode';
import WebSocket from 'ws';
import { EventEmitter } from 'events';

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
    this.ws = new WebSocket(`${this.relayUrl}/ws`);

    this.ws.on('open', () => {
      this.ws?.send(JSON.stringify({ type: 'register', repoUrl: this.repoUrl }));
    });

    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'push') {
        this.emit('push', msg.data);
      }
    });

    this.ws.on('close', () => {
      setTimeout(() => this.connect(), this.reconnectDelay);
    });

    this.ws.on('error', (err) => {
      vscode.window.showErrorMessage(`Webhook relay connection error: ${err.message}`);
    });
  }

  dispose() {
    this.ws?.close();
  }
}