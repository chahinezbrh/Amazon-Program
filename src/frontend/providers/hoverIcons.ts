/**
 * hoverIcons.ts
 * ------------------------------------------------------------------
 * VS Code's native hover (vscode.Hover + MarkdownString) cannot load an
 * external stylesheet, run JS, or apply CSS classes — MarkdownString's
 * `supportHtml` only allows a small safelist of raw tags with no
 * `class`/`style` attributes. To get pill-shaped, colored buttons like
 * the webview card, each button is rendered as a small self-contained
 * SVG and inlined as a base64 `data:` URI inside a markdown image link:
 *
 *   [![label](data:image/svg+xml;base64,...)](command:someCommand?args)
 *
 * Because that SVG document has no access to functionHoverPopup.css,
 * every color below is a hardcoded hex that mirrors the CSS file's
 * custom properties. If you change a color in functionHoverPopup.css,
 * update the matching constant here too.
 *
 * This file exists purely so HoverProvider.ts stays free of markup —
 * it only ever calls these builders.
 * ------------------------------------------------------------------
 */

// Keep these in sync with functionHoverPopup.css
export const COLORS = {
  bg: '#191c1e',
  border: 'rgba(255, 255, 255, 0.08)',
  teal: '#3ddc97', // .btn-add
  blue: '#8bb2f2', // .btn-ai
  orange: '#e59371', // .btn-write / no-memory text
  playTeal: '#3ac8ab', // .play-pill / voice memory pill
  playText: '#111416',
  muted: '#9ca8b4', // .footer-btn
} as const;

const FONT = "'JetBrains Mono', Consolas, 'Courier New', monospace";

function svgToBase64(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg.trim()).toString('base64')}`;
}

/** Generic outlined pill button (Add memory / AI docs / Write docs / Full docs) */
function outlinedPill(opts: {
  label: string;
  color: string;
  width: number;
  height?: number;
  leadingIcon?: string; // raw SVG markup to place before the text, already positioned
  textX: number;
}): string {
  const height = opts.height ?? 26;
  const rx = (height - 1.6) / 2;
  const hoverBg = hexToRgba(opts.color, 0.26);
  const glow = hexToRgba(opts.color, 0.45);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${height}" viewBox="0 0 ${opts.width} ${height}" fill="none">
    <style>
      rect {
        transition: fill 0.18s ease, stroke 0.18s ease, filter 0.18s ease;
        cursor: pointer;
      }
      text, path {
        transition: fill 0.18s ease, filter 0.18s ease;
        cursor: pointer;
      }
      svg:hover rect, rect:hover {
        fill: ${hoverBg};
        stroke: ${opts.color};
        stroke-width: 1.4;
        filter: drop-shadow(0 0 5px ${glow});
      }
      svg:hover text, text:hover {
        fill: #ffffff;
        filter: brightness(1.2);
      }
      svg:hover path, path:hover {
        fill: #ffffff;
        filter: brightness(1.2);
      }
    </style>
    <rect x="0.8" y="0.8" width="${opts.width - 1.6}" height="${height - 1.6}" rx="${rx}" fill="${hexToRgba(opts.color, 0.06)}" stroke="${opts.color}" stroke-width="1.2"/>
    ${opts.leadingIcon ?? ''}
    <text x="${opts.textX}" y="${height / 2 + 4}" fill="${opts.color}" font-family="${FONT}" font-size="11.5" font-weight="500" text-anchor="middle">${escapeXml(opts.label)}</text>
  </svg>`;
  return svgToBase64(svg);
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function getAddMemorySvg(): string {
  return outlinedPill({ label: '+ Add memory', color: COLORS.teal, width: 114, textX: 57 });
}

export function getAiDocsSvg(): string {
  const sparkles = `<path d="M19 7.5L20.2 11.2L24 12.5L20.2 13.8L19 17.5L17.8 13.8L14 12.5L17.8 11.2Z" fill="${COLORS.blue}"/>
    <path d="M24.5 6L25.2 7.8L27 8.5L25.2 9.2L24.5 11L23.8 9.2L22 8.5L23.8 7.8Z" fill="${COLORS.blue}"/>`;
  return outlinedPill({ label: 'AI docs', color: COLORS.blue, width: 98, leadingIcon: sparkles, textX: 60 });
}

export function getWriteDocsSvg(): string {
  return outlinedPill({ label: 'Write docs', color: COLORS.orange, width: 102, textX: 51 });
}

/** NEW — matches the same outlined-pill family as the other header buttons */
export function getFullDocsSvg(): string {
  return outlinedPill({ label: 'Full docs', color: COLORS.muted, width: 96, textX: 48 });
}

/** Row of text shown when the symbol has no recorded voice memory */
export function getNoMemorySvg(): string {
  const label = 'There is no voice memory !';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="24" viewBox="0 0 280 24" fill="none">
    <text x="2" y="17" fill="${COLORS.orange}" font-family="${FONT}" font-size="13" font-weight="500" letter-spacing="0.3">${escapeXml(label)}</text>
  </svg>`;
  return svgToBase64(svg);
}

/** "Voice memory" label shown above the player */
export function getVoiceMemoryLabelSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="18" viewBox="0 0 120 18" fill="none">
    <text x="0" y="13" fill="${COLORS.playTeal}" font-family="${FONT}" font-size="11.5" font-weight="500">Voice memory</text>
  </svg>`;
  return svgToBase64(svg);
}

/** Filled play pill + waveform, shown when the symbol DOES have a voice memory */
export function getVoiceMemorySvg(durationStr: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="26" viewBox="0 0 260 26" fill="none">
    <style>
      .play-rect {
        transition: fill 0.18s ease, filter 0.18s ease;
        cursor: pointer;
      }
      svg:hover .play-rect, .play-rect:hover {
        fill: #4fe0c2;
        filter: drop-shadow(0 0 6px rgba(58, 200, 171, 0.5));
      }
      .play-text {
        cursor: pointer;
      }
    </style>
    <rect class="play-rect" x="0" y="0" width="76" height="26" rx="13" fill="${COLORS.playTeal}"/>
    <path class="play-text" d="M16 8.5L25 13L16 17.5V8.5Z" fill="${COLORS.playText}"/>
    <text class="play-text" x="48" y="17" fill="${COLORS.playText}" font-family="${FONT}" font-size="11" font-weight="700" text-anchor="middle">${escapeXml(durationStr)}</text>
    <g fill="${COLORS.playTeal}">
      <rect x="90" y="6" width="3" height="14" rx="1.5"/>
      <rect x="96" y="1" width="3" height="24" rx="1.5"/>
      <rect x="102" y="3" width="3" height="20" rx="1.5"/>
      <rect x="108" y="1" width="3" height="24" rx="1.5"/>
      <rect x="114" y="8" width="3" height="10" rx="1.5"/>
      <rect x="120" y="5" width="3" height="16" rx="1.5"/>
      <rect x="126" y="0" width="3" height="26" rx="1.5"/>
      <rect x="132" y="0" width="3" height="26" rx="1.5"/>
      <rect x="138" y="0" width="3" height="26" rx="1.5"/>
      <rect x="144" y="4" width="3" height="18" rx="1.5"/>
      <rect x="150" y="7" width="3" height="12" rx="1.5"/>
    </g>
  </svg>`;
  return svgToBase64(svg);
}

/** Footer "Play memory" button */
export function getFooterPlayMemorySvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="20" viewBox="0 0 96 20" fill="none">
    <style>
      text {
        transition: fill 0.18s ease, filter 0.18s ease;
        cursor: pointer;
      }
      svg:hover text, text:hover {
        fill: #ffffff;
        filter: brightness(1.35);
      }
    </style>
    <text x="48" y="14" fill="${COLORS.muted}" font-family="${FONT}" font-size="11.5" font-weight="500" text-anchor="middle">Play memory</text>
  </svg>`;
  return svgToBase64(svg);
}

/** Footer "Full Docs" button */
export function getFooterFullDocsSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20" viewBox="0 0 80 20" fill="none">
    <style>
      text {
        transition: fill 0.18s ease, filter 0.18s ease;
        cursor: pointer;
      }
      svg:hover text, text:hover {
        fill: #ffffff;
        filter: brightness(1.35);
      }
    </style>
    <text x="40" y="14" fill="${COLORS.muted}" font-family="${FONT}" font-size="11.5" font-weight="500" text-anchor="middle">Full Docs</text>
  </svg>`;
  return svgToBase64(svg);
}

/** Small outlined "Play memory" pill for the header row */
export function getPlayMemoryHeaderSvg(): string {
  const triangle = `<path d="M15 8.5L23 13L15 17.5V8.5Z" fill="${COLORS.playTeal}"/>`;
  return outlinedPill({ label: 'Play memory', color: COLORS.playTeal, width: 118, leadingIcon: triangle, textX: 66 });
}