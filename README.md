# Paperwork Lite

Paperwork Lite is an offline-first, local workbench for notes, documents, code, portfolio publishing, and a secure vault.

Features included:
- Minimal workspace with Home, sidebar, breadcrumbs, navigation, theme toggle, focus mode, and command palette
- Infinitely nested folders and notes with create, rename, duplicate, move-like selection, favorite, lock, delete, and JSON import/export
- Rich text editor with checklists, tables, code insertion, tabs, line numbers, language selection, formatting, preview, search/replace, and autosave
- Local-only encrypted vault using Web Crypto API with master password setup and unlock
- Portfolio Studio with editable pages and export to a client-only HTML portfolio
- 11 interactive origami companions
- Offline support via service worker and PWA manifest

Run locally:
1. open a terminal in the project folder
2. run: python3 -m http.server 8000
3. open: http://localhost:8000/

Notes:
- This project intentionally avoids runtime CDN dependencies.
- Browser storage is local-only and not absolute protection.
- Public hosting requires a real deployed site or static hosting provider.
- This project is designed for offline desktop/mobile browsers, not for multi-user server sync.
