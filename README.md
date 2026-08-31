# Doc Manager

A VS Code extension that keeps documentation tied to the code it describes.

Every piece of documentation — written, AI-generated, or recorded as a voice
memo — is attached to a specific function and hashed against that function's
body. When someone pushes a change, Doc Manager compares the new code against
what the documentation was written for and flags the docs that can no longer be
trusted.

---

## What it does

**Hover any function** to see its documentation, or to add some if there is
none.

**Four kinds of documentation**, side by side in one panel:

| | |
|---|---|
| **Source** | comments already in the code, imported automatically |
| **Written** | prose you type yourself |
| **AI docs** | generated with Gemini, refined in conversation, saved only when you accept it |
| **Voice** | short recordings, with an optional transcript |

**Change detection.** Push a commit and Doc Manager re-hashes the affected
functions. Anything documented against the old code is marked stale, and a
notification explains what changed — with a structural comparison that
distinguishes a renamed variable from an altered condition.

**Documentation travels with the repo.** Everything is stored as JSON under
`.docmanager/`, so a teammate who clones the project gets the documentation too.

---

## Requirements

| | |
|---|---|
| VS Code | 1.85 or later |
| Node.js | 20 or later |
| A language extension | for each language you document |
| [ffmpeg](https://ffmpeg.org/download.html) | voice recording |
| [Gemini API key](https://aistudio.google.com/apikey) | AI documentation |
| GitHub personal access token | push notifications |

All six are needed for the full feature set. Set them up in the order below —
each step is independent, so a failure in one only affects its own feature.

---

## Installation

```bash
git clone https://github.com/chahinezbrh/Amazon-Program.git
cd Amazon-Program
npm install
npm run build
```

Then open the folder in VS Code and press **F5**. A second window opens —
titled *Extension Development Host* — with the extension loaded. Use that
window to open the repository you want to document.

`npm install` needs Node 20 or later.

---

## Setup

### 1. Connect a repository

The Connect Repo panel opens the first time you open an unindexed folder, or
run **Doc Manager: Connect Repository** from the Command Palette.

Paste a GitHub URL to clone and index a repository, or connect the folder
already open. Indexing walks the repo, extracts every function, and records a
hash of each one — that baseline is what later changes are compared against.

### 2. Voice recording

Install ffmpeg:

```powershell
winget install ffmpeg          # Windows
brew install ffmpeg            # macOS
sudo apt install ffmpeg        # Debian/Ubuntu
```

If it isn't on your `PATH`, set the full path in settings:

```json
"docManager.ffmpegPath": "C:\\path\\to\\ffmpeg.exe"
```

Your microphone is remembered after the first recording. Clear
`docManager.audioDevice` to be asked again — worth doing if you change headsets.

### 3. AI documentation

Create a key at [Google AI Studio](https://aistudio.google.com/apikey), then run
**Doc Manager: Set Gemini API Key**. It is stored in VS Code's encrypted secret
storage, never in a settings file.

Run the same command again to replace it.

### 4. Push notifications

Needs a GitHub token with permission to manage webhooks on the repository:

**Settings → Developer settings → Personal access tokens → Fine-grained tokens**

- Repository access: only the repository you are connecting
- Permissions → **Webhooks: Read and write**

You are prompted for it when connecting, and it is stored per repository in
secret storage.

Notifications also need the relay service reachable — see
`docmanager-relay/README.md` for deployment.

---

## Using it

**Read** — hover a function name. Documentation appears in the hover; **Full
docs** opens the panel.

**Write** — open the panel and use **+ Written**. What you type is saved to
`.docmanager/docs.json` and committed with your code.

**Generate** — **+ AI docs** sends the function to Gemini and returns a draft.
Refine it in the input below ("make it shorter", "mention the error handling")
until it reads correctly, then **Save**. Nothing is stored until you accept it.

**Record** — **+ Voice** starts recording; a timer appears in the status bar and
clicking it stops. Add a transcript when prompted. Recordings play back in the
panel, with the waveform doubling as a scrub bar.

**Import existing comments** — the sync icon in the editor title bar scans the
repository and imports every comment sitting above a function.

**Respond to changes** — after a push, the Notification Center lists the
functions that changed. **See docs** opens the documentation for one of them,
where anything written against the old code carries a stale banner.
**Resolve** clears the alert once you have dealt with it.

---

## Settings

| Setting | Purpose |
|---|---|
| `docManager.ffmpegPath` | Path to the ffmpeg binary |
| `docManager.audioDevice` | Remembered microphone; clear to be asked again |
| `docManager.author` | Name recorded as the author of documentation you write |
| `docManager.geminiModel` | Gemini model used for generation |

---

## How it is stored

```
your-repo/
├── .docmanager/
│   ├── docs.json          documentation, committed with your code
│   └── audio/             voice recordings
└── .funcmanager/
    ├── functions.json     every function and its hash — the change baseline
    └── notifications.json alerts from incoming pushes
```

`docs.json` is designed to be committed: prose is stored as arrays of lines so
git diffs it line by line, and two people documenting different functions merge
without conflict.

---

## Known limitations

**Change classification is a heuristic.** The AST comparison correctly treats
renames and reformatting as syntax-only, but it is not a proof of behavioural
equivalence — swapping one in-scope identifier for another is invisible to it.
It errs toward flagging a change rather than hiding one.

**Language support depends on the bundled grammars.** Twelve languages ship
with the extension; anything else is skipped during indexing.

**Voice recordings are not committed by default.** `.docmanager/audio/` is
gitignored, so memos stay on the machine that recorded them. Committing them, or
using Git LFS, would make them travel with the repository — at the cost of size.

**Notifications require the relay to be running.** Push events reach the
extension through a WebSocket relay, which must be deployed somewhere GitHub can
POST to.

**Function detection uses `tree-sitter`.** Anonymous functions and some
expression forms are recorded as `anonymous` and may collide within a file.

---

## Development

```bash
npm install
npm run build      # compile TypeScript and bundle the webviews
npm run dev        # rebuild on change
```

`F5` launches an Extension Development Host. The webviews keep their loaded
bundle when hidden, so close and reopen a panel after rebuilding rather than
only reloading the window.

```
src/
├── extension.ts              activation and command registration
├── shared/                   types shared across both sides
├── backend/                  no vscode imports — testable in isolation
│   ├── db/                   file walking, language configuration
│   └── services/             parsing, hashing, storage, Gemini, change detection
└── frontend/
    ├── providers/            hover and webview panels
    ├── commands/             command implementations
    ├── services/             the extension-host side of storage
    └── webviews/             React UI, bundled by esbuild
```

Anything under `backend/` avoids importing `vscode`, so it can be exercised from
a plain script. `frontend/` owns everything that needs the editor.

---

## Authors

Built by  Chahinez Brahimi and Rayhane Manel Souames.