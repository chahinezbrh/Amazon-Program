"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showDocPanel = showDocPanel;
const DocPanelProvider_1 = require("../providers/DocPanelProvider");
const docClient_1 = require("../services/docClient");
async function showDocPanel(context, meta) {
    // 1. Show the panel (shows "Loading..." state in Webview)
    DocPanelProvider_1.DocPanelProvider.show(context.extensionUri, meta);
    try {
        // 2. Fetch the REAL data dynamically
        const entries = await (0, docClient_1.getDocsForSymbol)(meta);
        // 3. Send that data to the Webview
        DocPanelProvider_1.DocPanelProvider.currentPanel?.updateEntries(entries);
    }
    catch (e) {
        DocPanelProvider_1.DocPanelProvider.currentPanel?.updateError("Failed to fetch docs");
    }
}
