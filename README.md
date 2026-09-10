# Developer Utility

A local-first Electron desktop toolkit for common developer conversions and inspection tasks. It uses React, TypeScript, and a secure Electron preload bridge; no Python runtime is used by the new application.

## Features

- Raw HTTP request to cURL conversion, including attached JSON bodies and configurable ignored headers.
- cURL to readable request conversion.
- JSON formatting, minifying, validation, and structural comparison.
- JWT decoding (without signature verification), SQL formatting, Base64 and URL conversion, timestamp conversion, UUID v4, and common hashes.
- Native open/save dialogs, clipboard support, sidebar navigation, status feedback, and light/dark toggle.

## Install and run

```powershell
npm install
npm run dev
```

Normal mode uses the standard renderer startup flow.

```powershell
python main.py
```

Development mode starts the same app with watch support and a lightweight live-reload flow for the local Electron + Vite project:

```powershell
python dev.py
```

The development runner watches the project tree for relevant source changes, ignores generated and dependency folders, debounces burst saves, and only restarts the Electron process when needed. For the renderer layer, Vite's dev server provides the live update path while the UI keeps the current app state and shows a DEV • LIVE RELOAD indicator. Use Ctrl + Shift + R to trigger a manual reload in development mode.

Run validation with `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

## Package

Use `npm run dist:win` for a Windows NSIS installer. `npm run dist:mac` is configured for both Intel and Apple Silicon macOS builds; perform signing and notarization on macOS with an Apple Developer account.

## Project structure

`src/` contains the React renderer and pure TypeScript utilities. `electron/` contains the secure main process, typed preload API, and local-only HTTP Toolkit adapter bridge. HTTP Toolkit Desktop does not expose a supported production plugin API; real in-process events require a separately rebuilt local HTTP Toolkit integration that posts normalized exchanges to the authenticated local bridge.
