# Developer Utility

A local-first Electron desktop toolkit for common developer conversions and inspection tasks. It uses React, TypeScript, and a secure Electron preload bridge; no Python runtime is used by the new application.

## Features

- Raw HTTP request to cURL conversion, including attached JSON bodies and configurable ignored headers.
- cURL to readable request conversion.
- JSON formatting, minifying, validation, and structural comparison.
- JWT decoding (without signature verification), SQL formatting, Base64 and URL conversion, timestamp conversion, UUID v4, and common hashes.
- Native open/save dialogs, clipboard support, sidebar navigation, status feedback, and light/dark toggle.

## Mobile Network Inspector

The Network Inspector uses the existing in-process HTTP/1.x forward proxy. For PC browser capture, start capture and configure the browser to use the loopback address and actual proxy port shown by the app. HTTP requests and responses can be inspected. HTTPS `CONNECT` connections are tunnelled unchanged; this app does not decrypt TLS, provide a development CA, or install certificates.

For phones, select one of the detected PC LAN IPv4 addresses and explicitly choose **Enable LAN Access**. The app asks for confirmation before binding to that specific interface. It displays the actual bound port, never the requested dynamic port `0`. A LAN address being listed does not mean the listener is exposed on it. LAN mode uses an unauthenticated proxy; other devices on the network may reach it while enabled. **Return to Loopback Only** closes that listener and rebinds the same port to loopback. The app does not change phone settings.

Connect the phone and PC to the same Wi-Fi network. On Android, edit the connected Wi-Fi network, open Advanced options, select Manual proxy, and enter the displayed PC LAN address and actual port. On iOS, open Settings → Wi-Fi → the connected network's information button → Configure Proxy → Manual, then enter those values. Start the local connection test and open its displayed URL on the phone. To capture a real HTTP request, leave capture enabled and visit `http://neverssl.com/`. If the test fails, check the selected interface, Wi-Fi client isolation, guest network restrictions, PC firewall, proxy values, and whether the phone app honors Wi-Fi proxy settings.

This proxy does not decrypt HTTPS. A development CA cannot enable HTTPS inspection in this build; no CA is supplied. Mobile apps can ignore proxy settings, reject user-installed CA certificates, or use certificate pinning. The app does not bypass those restrictions. When finished, turn the phone's Wi-Fi proxy off, remove any test certificate installed separately, and return the proxy listener to loopback-only mode.

Capture is held in memory for the current session. The list is capped at 1,000 requests and captured text bodies at 64 KiB per direction; larger bodies continue to be forwarded and are marked as truncated. JSON export redacts common credential headers, URL query values, and recognized sensitive body fields. Captured values can still be sensitive, so only inspect authorized traffic and review exports before sharing. The proxy engine is the MIT-licensed `http-proxy` package; the app handles the narrow CONNECT tunnel path without TLS interception. WebSockets, HTTP/2, HTTP/3, and persistence are not implemented.

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

Use `npm run dist:win` for a Windows NSIS installer. Use `npm run dist:mac` for both DMG and PKG installers targeting Intel and Apple Silicon macOS; perform signing and notarization on macOS with an Apple Developer account.

## Project structure

`src/` contains the React renderer and pure TypeScript utilities. `electron/` contains the secure main process, typed preload API, and local-only HTTP Toolkit adapter bridge. HTTP Toolkit Desktop does not expose a supported production plugin API; real in-process events require a separately rebuilt local HTTP Toolkit integration that posts normalized exchanges to the authenticated local bridge.
