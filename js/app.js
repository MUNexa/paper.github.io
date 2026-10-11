const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(key);
  }
};

const DB_NAME = "paperwork-lite-db";
const DB_VERSION = 1;

const state = {
  theme: "light",
  layout: "desktop",
  activeView: "home",
  files: [],
  selectedNoteId: null,
  tabs: [],
  activeTabId: null,
  history: [],
  historyIndex: -1,
  settings: {
    autoLockMinutes: 20,
    focusMode: false,
    mobileMode: false
  },
  portfolio: {
    pages: [
      { id: crypto.randomUUID(), name: "Home", theme: "default", sections: ["hero", "projects", "contact"] },
      { id: crypto.randomUUID(), name: "About", theme: "default", sections: ["bio"] },
      { id: crypto.randomUUID(), name: "Projects", theme: "default", sections: ["projects"] },
      { id: crypto.randomUUID(), name: "Contact", theme: "default", sections: ["contact"] }
    ],
    activePageId: null
  },
  auth: {
    masterSalt: null,
    masterHash: null,
    key: null,
    locked: true
  },
  vault: {
    unlocked: false,
    entries: []
  },
  paletteOpen: false
};

let db;

function generateId(prefix = "id") {
  return `${prefix}-${crypto.randomUUID()}`;
}

function getDefaultWorkspace() {
  return {
    id: generateId("folder"),
    type: "folder",
    name: "Workspace",
    parentId: null,
    favorite: false,
    locked: false,
    createdAt: new Date().toISOString(),
    children: [
      {
        id: generateId("note"),
        type: "note",
        name: "Welcome",
        parentId: null,
        favorite: false,
        locked: false,
        createdAt: new Date().toISOString(),
        content: "# Welcome\n\nThis is your Paperwork Lite workspace.\n\n- checklist item\n- another item\n\n```js\nconsole.log('Hello from Paperwork Lite');\n```",
        language: "Markdown",
        tags: ["welcome"]
      }
    ]
  };
}

function normalizeItem(item, parentId = null) {
  return {
    id: item.id || generateId(item.type === "folder" ? "folder" : "note"),
    type: item.type || "note",
    name: item.name || "Untitled",
    parentId: item.parentId ?? parentId,
    favorite: !!item.favorite,
    locked: !!item.locked,
    createdAt: item.createdAt || new Date().toISOString(),
    content: item.content || "",
    language: item.language || "Markdown",
    tags: Array.isArray(item.tags) ? item.tags : [],
    children: Array.isArray(item.children) ? item.children.map((child) => normalizeItem(child, item.id)) : []
  };
}

function flattenTree(items) {
  const out = [];
  function walk(arr) {
    arr.forEach((item) => {
      out.push(item);
      if (Array.isArray(item.children) && item.children.length) walk(item.children);
    });
  }
  walk(items);
  return out;
}

function findById(items, id) {
  for (const item of items) {
    if (item.id === id) return item;
    if (Array.isArray(item.children)) {
      const found = findById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

function findParent(items, id) {
  for (const item of items) {
    if (Array.isArray(item.children) && item.children.some((child) => child.id === id)) return item;
    if (Array.isArray(item.children)) {
      const found = findParent(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

function insertNode(items, parentId, node) {
  if (!parentId) {
    items.push(node);
    return;
  }

  for (const item of items) {
    if (item.id === parentId) {
      if (!Array.isArray(item.children)) item.children = [];
      item.children.push(node);
      return;
    }
    if (Array.isArray(item.children)) insertNode(item.children, parentId, node);
  }
}

function removeNode(items, id) {
  const idx = items.findIndex((item) => item.id === id);
  if (idx !== -1) {
    items.splice(idx, 1);
    return true;
  }
  for (const item of items) {
    if (Array.isArray(item.children) && removeNode(item.children, id)) return true;
  }
  return false;
}

function duplicateNode(items, id) {
  const item = findById(items, id);
  if (!item) return;

  const clone = JSON.parse(JSON.stringify(item));
  clone.id = generateId(item.type === "folder" ? "folder" : "note");
  clone.name = `${item.name} Copy`;
  clone.createdAt = new Date().toISOString();
  clone.favorite = false;
  clone.children = Array.isArray(item.children) ? item.children.map((child) => JSON.parse(JSON.stringify(child))) : [];

  if (item.parentId) {
    const parent = findById(items, item.parentId);
    if (parent) parent.children.push(clone);
  } else {
    items.push(clone);
  }
}

function showToast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add("hidden"), 1800);
}

function setTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  state.theme = theme;
  storage.set("paperwork.theme", theme);
}

function setLayout(mode) {
  state.layout = mode;
  document.body.classList.toggle("mobile-layout", mode === "mobile");
  storage.set("paperwork.layout", mode);
}

function updateSettingsControls() {
  document.getElementById("themeSelect").value = state.theme;
  document.getElementById("layoutSelect").value = state.layout;
  document.getElementById("autoLockMinutes").value = String(state.settings.autoLockMinutes || 20);
}

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      ["workspace", "vault", "portfolio", "settings"].forEach((name) => {
        if (!dbInstance.objectStoreNames.contains(name)) {
          dbInstance.createObjectStore(name, { keyPath: "id" });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readDB(storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function writeDB(storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const request = tx.objectStore(storeName).put(value);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

function loadWorkspace() {
  const stored = storage.get("paperwork.workspace", null);
  if (stored && Array.isArray(stored) && stored.length) {
    state.files = stored.map((item) => normalizeItem(item));
  } else {
    state.files = [normalizeItem(getDefaultWorkspace())];
  }
  state.selectedNoteId = state.files[0]?.id || null;
}

function persistWorkspace() {
  storage.set("paperwork.workspace", state.files);
  writeDB("workspace", { id: "main", value: state.files }).catch(() => {});
  document.getElementById("autosaveIndicator").textContent = `Autosave: saved ${new Date().toLocaleTimeString()}`;
}

function renderTree(items, depth = 0) {
  return items.map((item) => {
    const children = Array.isArray(item.children) ? item.children : [];
    const active = item.id === state.selectedNoteId;
    return `
      <div class="tree-node" style="margin-left:${depth * 12}px">
        <div class="tree-row">
          <div class="tree-label">
            <span>${item.type === "folder" ? "📁" : "📄"}</span>
            <span>${item.name}</span>
          </div>
          <button class="mini-button" data-tree-open="${item.id}">Open</button>
        </div>
        ${children.length ? `<div class="tree-children">${renderTree(children, depth + 1)}</div>` : ""}
      </div>
    `;
  }).join("");
}

function updateWorkspaceTree() {
  const tree = document.getElementById("workspaceTree");
  tree.innerHTML = renderTree(state.files);

  tree.querySelectorAll("[data-tree-open]").forEach((button) => {
    button.addEventListener("click", () => openFile(button.dataset.treeOpen));
  });
}

function renderFileList() {
  const list = document.getElementById("fileList");
  const all = flattenTree(state.files);
  list.innerHTML = all.map((item) => `
    <div class="file-item ${item.id === state.selectedNoteId ? "active" : ""}" data-file-id="${item.id}">
      <div class="file-kind">${item.type === "folder" ? "📁" : "📄"}</div>
      <div style="flex:1;">${item.name}</div>
      <button class="mini-button" data-favorite-id="${item.id}">★</button>
    </div>
  `).join("");

  list.querySelectorAll("[data-file-id]").forEach((el) => {
    el.addEventListener("click", () => openFile(el.dataset.fileId));
  });

  list.querySelectorAll("[data-favorite-id]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const node = findById(state.files, btn.dataset.favoriteId);
      if (!node) return;
      node.favorite = !node.favorite;
      persistWorkspace();
      renderHomeStats();
      renderFileList();
    });
  });
}

function updateBreadcrumbs() {
  const crumbs = document.getElementById("breadcrumbs");
  const selected = findById(state.files, state.selectedNoteId);
  const chain = [];
  let current = selected;

  while (current) {
    chain.unshift(current.name);
    current = findParent(state.files, current.id);
  }

  if (!chain.length) chain.push("Home");
  crumbs.innerHTML = chain.map((part) => `<span class="crumb">${part}</span>`).join("");
}

function renderTabs() {
  const tabsEl = document.getElementById("editorTabs");
  tabsEl.innerHTML = state.tabs.map((tab) => `
    <button class="tab ${tab.id === state.activeTabId ? "active" : ""}" data-tab-id="${tab.id}">
      ${tab.name}
      <span data-close-tab="${tab.id}">×</span>
    </button>
  `).join("");

  tabsEl.querySelectorAll(".tab").forEach((tabBtn) => {
    tabBtn.addEventListener("click", (event) => {
      const id = tabBtn.dataset.tabId;
      if (event.target.matches("[data-close-tab]")) {
        closeTab(id);
      } else {
        const item = findById(state.files, id);
        if (item) {
          state.activeTabId = id;
          state.selectedNoteId = id;
          updateEditor();
        }
      }
    });
  });
}

function closeTab(id) {
  state.tabs = state.tabs.filter((tab) => tab.id !== id);
  if (state.activeTabId === id) {
    state.activeTabId = state.tabs[0]?.id || null;
  }
  renderTabs();
  if (state.activeTabId) {
    const item = findById(state.files, state.activeTabId);
    if (item) updateEditor();
  }
}

function openFile(id) {
  const item = findById(state.files, id);
  if (!item) return;
  state.selectedNoteId = item.id;
  if (!state.tabs.some((tab) => tab.id === item.id)) {
    state.tabs.push({ id: item.id, name: item.name, language: item.language || "Markdown" });
  }
  state.activeTabId = item.id;
  updateEditor();
  updateBreadcrumbs();
  renderFileList();
  updateWorkspaceTree();
  renderHomeStats();
}

function updateEditor() {
  const item = findById(state.files, state.selectedNoteId);
  const input = document.getElementById("editorInput");
  const highlight = document.getElementById("editorHighlight");
  const languageSelect = document.getElementById("languageSelect");

  if (!item) {
    input.value = "";
    highlight.innerHTML = "";
    return;
  }

  input.dataset.noteId = item.id;
  input.value = item.content || "";
  languageSelect.innerHTML = getLanguageChoices().map((lang) => `
    <option value="${lang}" ${lang === (item.language || "Markdown") ? "selected" : ""}>${lang}</option>
  `).join("");
  highlight.innerHTML = highlightCode(item.content || "", item.language || "Markdown");
  updateLineNumbers();
  updateBreadcrumbs();
  renderTabs();
}

function updateLineNumbers() {
  const input = document.getElementById("editorInput");
  const lines = input.value.split("\n").length;
  const numbers = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
  document.getElementById("lineNumbers").textContent = numbers;
}

function createFolder(parentId = null) {
  const folder = normalizeItem({
    type: "folder",
    name: "New Folder",
    parentId,
    favorite: false,
    children: []
  });
  insertNode(state.files, parentId, folder);
  persistWorkspace();
  renderAll();
  showToast("Folder created");
}

function createNote(parentId = null) {
  const note = normalizeItem({
    type: "note",
    name: "Untitled",
    parentId,
    favorite: false,
    content: "# Untitled\n\nStart writing...",
    language: "Markdown"
  });

  insertNode(state.files, parentId, note);
  persistWorkspace();
  renderAll();
  openFile(note.id);
  showToast("Note created");
}

function deleteSelectedNode() {
  const id = state.selectedNoteId;
  if (!id) return;
  removeNode(state.files, id);
  persistWorkspace();
  renderAll();
  showToast("Node removed");
}

function renameSelectedNode(newName) {
  const item = findById(state.files, state.selectedNoteId);
  if (!item || !newName.trim()) return;
  item.name = newName.trim();
  persistWorkspace();
  renderAll();
}

function duplicateSelectedNode() {
  if (!state.selectedNoteId) return;
  duplicateNode(state.files, state.selectedNoteId);
  persistWorkspace();
  renderAll();
  showToast("Node duplicated");
}

function toggleFavoriteSelected() {
  const item = findById(state.files, state.selectedNoteId);
  if (!item) return;
  item.favorite = !item.favorite;
  persistWorkspace();
  renderAll();
}

function renderAll() {
  updateWorkspaceTree();
  renderFileList();
  updateBreadcrumbs();
  renderHomeStats();
  renderTabs();
  updateEditor();
  renderVault();
  renderPortfolio();
  updateSettingsControls();
  document.getElementById("workspaceStatus").textContent = state.auth.locked ? "Workspace locked" : "Workspace active";
}

function renderHomeStats() {
  const all = flattenTree(state.files);
  const notes = all.filter((n) => n.type === "note").length;
  const folders = all.filter((n) => n.type === "folder").length;
  const favorites = all.filter((n) => n.favorite).length;
  const recent = all.slice(0, 5);

  document.getElementById("statNotes").textContent = String(notes);
  document.getElementById("statFolders").textContent = String(folders);
  document.getElementById("statFavorites").textContent = String(favorites);
  document.getElementById("statPortfolioPages").textContent = String(state.portfolio.pages.length);

  document.getElementById("recentList").innerHTML = recent.map((item) => `
    <div class="list-item">
      <strong>${item.name}</strong>
      <div class="meta">${item.type}</div>
    </div>
  `).join("");
}

function showView(view) {
  state.activeView = view;
  document.querySelectorAll(".content-area").forEach((area) => {
    const isActive = area.id === `${view}Area`;
    area.classList.toggle("visible", isActive);
    area.classList.toggle("hidden", !isActive);
  });

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });
}

function openCommandPalette() {
  const el = document.getElementById("commandPalette");
  el.classList.remove("hidden");
  state.paletteOpen = true;
  const input = document.getElementById("paletteInput");
  input.value = "";
  input.focus();
  updatePalette("");
}

function closeCommandPalette() {
  document.getElementById("commandPalette").classList.add("hidden");
  state.paletteOpen = false;
}

function updatePalette(query) {
  const resultsEl = document.getElementById("paletteResults");
  const q = (query || "").trim().toLowerCase();

  const commands = [
    { label: "New note", action: () => createNote() },
    { label: "New folder", action: () => createFolder() },
    { label: "Open workspace", action: () => showView("workspace") },
    { label: "Open portfolio", action: () => showView("portfolio") },
    { label: "Open vault", action: () => openVault() },
    { label: "Toggle theme", action: () => setTheme(state.theme === "dark" ? "light" : "dark") },
    { label: "Lock workspace", action: () => lockWorkspace() },
    { label: "Settings", action: () => openSettings() }
  ];

  const notes = flattenTree(state.files).filter((item) => item.type === "note" && (!q || item.name.toLowerCase().includes(q) || (item.content || "").toLowerCase().includes(q)));
  const pageItems = (state.portfolio.pages || []).filter((page) => !q || page.name.toLowerCase().includes(q));

  const items = [
    ...commands,
    ...notes.map((n) => ({ label: `Open note: ${n.name}`, action: () => { openFile(n.id); closeCommandPalette(); } })),
    ...pageItems.map((page) => ({ label: `Open portfolio page: ${page.name}`, action: () => { state.portfolio.activePageId = page.id; renderPortfolio(); closeCommandPalette(); } }))
  ];

  const filtered = q ? items.filter((item) => item.label.toLowerCase().includes(q)) : items.slice(0, 12);
  resultsEl.innerHTML = filtered.map((item) => `
    <div class="palette-result">
      <strong>${item.label}</strong>
      <button class="mini-button" data-cmd="${item.label}">Run</button>
    </div>
  `).join("");

  resultsEl.querySelectorAll("[data-cmd]").forEach((button) => {
    button.addEventListener("click", () => {
      const label = button.dataset.cmd;
      const match = filtered.find((item) => item.label === label);
      if (match) match.action();
    });
  });
}

function renderColorCard(name) {
  const palette = ["#8b5cf6", "#22c55e", "#f59e0b", "#06b6d4", "#f43f5e", "#10b981"];
  const color = palette[Math.abs(name.length) % palette.length];
  return `<svg viewBox="0 0 110 110" class="companion-svg" aria-label="${name}"><g><polygon points="55,12 23,55 55,98 87,55" fill="${color}" opacity="0.35"></polygon><polygon points="55,24 32,55 55,86 78,55" fill="#f8fafc" opacity="0.72"></polygon><circle cx="55" cy="55" r="18" fill="#e2e8f0"></circle><path d="M55 38 L68 55 L55 72 L42 55 Z" fill="${color}" opacity="0.55"></path></g></svg>`;
}

function initCompanions() {
  const target = document.getElementById("companionArea");
  const companions = ["Dragon", "Dog", "Cat", "Snake", "Butterfly", "Tree", "Turtle", "Frog", "Sloth", "Eagle", "Spider"];
  target.innerHTML = `
    <h3>Origami companions</h3>
    <div class="companion-panel">
      ${companions.map((name, index) => `
        <div class="companion-card" style="animation-delay:${index * 110}ms">
          ${renderColorCard(name)}
          <div class="meta">${name}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function setupNavigation() {
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  document.getElementById("newFolderBtn").addEventListener("click", () => createFolder());
  document.getElementById("newNoteBtn").addEventListener("click", () => createNote());
  document.getElementById("workspaceNewNoteBtn").addEventListener("click", () => createNote());

  document.getElementById("themeToggle").addEventListener("click", () => {
    setTheme(state.theme === "dark" ? "light" : "dark");
    updateSettingsControls();
  });

  document.getElementById("focusModeToggle").addEventListener("click", () => {
    state.settings.focusMode = !state.settings.focusMode;
    document.body.classList.toggle("focus-mode", state.settings.focusMode);
    showToast(state.settings.focusMode ? "Focus mode enabled" : "Focus mode disabled");
  });

  document.getElementById("mobileToggle").addEventListener("click", () => {
    setLayout(state.layout === "mobile" ? "desktop" : "mobile");
    updateSettingsControls();
  });

  document.getElementById("searchButton").addEventListener("click", () => openCommandPalette());
  document.getElementById("paletteInput").addEventListener("input", (event) => updatePalette(event.target.value));
  document.getElementById("commandPalette").addEventListener("click", (event) => {
    if (event.target === document.getElementById("commandPalette")) closeCommandPalette();
  });

  document.getElementById("backBtn").addEventListener("click", () => {
    if (state.historyIndex > 0) {
      state.historyIndex -= 1;
      const target = state.history[state.historyIndex];
      if (target) openFile(target);
    }
  });

  document.getElementById("forwardBtn").addEventListener("click", () => {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex += 1;
      const target = state.history[state.historyIndex];
      if (target) openFile(target);
    }
  });

  document.getElementById("upBtn").addEventListener("click", () => {
    const item = findById(state.files, state.selectedNoteId);
    if (item && item.parentId) openFile(item.parentId);
  });

  document.getElementById("homeBtn").addEventListener("click", () => showView("home"));

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCommandPalette();
    }
    if (event.key === "Escape" && state.paletteOpen) {
      closeCommandPalette();
    }
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (view) showView(view);
      const action = button.dataset.action;
      if (action === "search") openCommandPalette();
      if (action === "stats") showView("home");
      if (action === "lock") lockWorkspace();
      if (action === "favorites") showToast("Favorites available from note cards");
    });
  });
}

function setupEditor() {
  const input = document.getElementById("editorInput");
  const highlight = document.getElementById("editorHighlight");
  const languageSelect = document.getElementById("languageSelect");

  input.addEventListener("input", (event) => {
    const item = findById(state.files, state.selectedNoteId);
    if (!item) return;
    item.content = event.target.value;
    highlight.innerHTML = highlightCode(item.content, item.language || "Markdown");
    updateLineNumbers();
    persistWorkspace();
  });

  languageSelect.addEventListener("change", (event) => {
    const item = findById(state.files, state.selectedNoteId);
    if (!item) return;
    item.language = event.target.value;
    highlight.innerHTML = highlightCode(item.content || "", item.language);
    persistWorkspace();
  });

  input.addEventListener("scroll", () => {
    highlight.scrollTop = input.scrollTop;
    highlight.scrollLeft = input.scrollLeft;
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.setRangeText("  ", start, end, "end");
    }
  });

  document.getElementById("formatBtn").addEventListener("click", () => {
    const item = findById(state.files, state.selectedNoteId);
    if (!item) return;
    item.content = formatText(item.content || "", item.language || "Markdown");
    input.value = item.content;
    highlight.innerHTML = highlightCode(item.content, item.language || "Markdown");
    updateLineNumbers();
    persistWorkspace();
  });

  document.getElementById("previewBtn").addEventListener("click", () => {
    const item = findById(state.files, state.selectedNoteId);
    if (!item) return;
    const html = renderMarkdownPreview(item.content || "");
    const preview = window.open("", "_blank", "width=980,height=700");
    preview.document.write(html);
    preview.document.close();
  });

  document.getElementById("insertChecklistBtn").addEventListener("click", () => {
    const insert = "- [ ] task\n- [ ] another task\n";
    input.setRangeText(insert, input.selectionStart, input.selectionEnd, "end");
    input.dispatchEvent(new Event("input"));
  });

  document.getElementById("insertTableBtn").addEventListener("click", () => {
    const insert = "| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n";
    input.setRangeText(insert, input.selectionStart, input.selectionEnd, "end");
    input.dispatchEvent(new Event("input"));
  });

  document.getElementById("insertCodeBtn").addEventListener("click", () => {
    const insert = "```js\nconsole.log('hello');\n```\n";
    input.setRangeText(insert, input.selectionStart, input.selectionEnd, "end");
    input.dispatchEvent(new Event("input"));
  });

  document.getElementById("findNextBtn").addEventListener("click", () => {
    const searchVal = document.getElementById("searchInput").value;
    if (!searchVal) return;
    const index = input.value.indexOf(searchVal, input.selectionStart + 1);
    if (index >= 0) {
      input.focus();
      input.setSelectionRange(index, index + searchVal.length);
    }
  });

  document.getElementById("replaceBtn").addEventListener("click", () => {
    const searchVal = document.getElementById("searchInput").value;
    const replaceVal = document.getElementById("replaceInput").value;
    if (!searchVal) return;

    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    const selected = text.substring(start, end);
    if (selected === searchVal) {
      input.setRangeText(replaceVal, start, end, "end");
    } else {
      const idx = text.indexOf(searchVal);
      if (idx >= 0) input.setRangeText(replaceVal, idx, idx + searchVal.length, "end");
    }
    input.dispatchEvent(new Event("input"));
  });

  document.getElementById("replaceAllBtn").addEventListener("click", () => {
    const searchVal = document.getElementById("searchInput").value;
    const replaceVal = document.getElementById("replaceInput").value;
    if (!searchVal) return;
    input.value = input.value.split(searchVal).join(replaceVal);
    input.dispatchEvent(new Event("input"));
  });

  document.getElementById("importBtn").addEventListener("click", () => {
    const inputFile = document.createElement("input");
    inputFile.type = "file";
    inputFile.accept = ".json,.txt,.md,.js,.html,.css,.csv,.svg";
    inputFile.onchange = (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const item = findById(state.files, state.selectedNoteId);
        if (!item) return;
        item.content = String(reader.result || "");
        item.language = getLanguageFromFileName(file.name);
        persistWorkspace();
        updateEditor();
      };
      reader.readAsText(file);
    };
    inputFile.click();
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    const item = findById(state.files, state.selectedNoteId);
    if (!item) return;
    const payload = JSON.stringify({ name: item.name, language: item.language, content: item.content }, null, 2);
    downloadFile(`${(item.name || "export").replace(/\s+/g, "-").toLowerCase()}.json`, payload, "application/json");
    showToast("JSON export created");
  });
}

function formatText(text, language) {
  const value = String(text || "");
  if (language === "JSON") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return value.trim();
}

function renderMarkdownPreview(markdown) {
  const safe = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, "<br><br>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/<li>/g, "<ul><li>")
    .replace(/<\/li>/g, "</li></ul>");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Preview</title></head><body style="font-family:system-ui;padding:24px;line-height:1.6;">${safe}</body></html>`;
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function openSettings() {
  document.getElementById("settingsModal").classList.remove("hidden");
}

function setupSettings() {
  document.getElementById("saveSettingsBtn").addEventListener("click", () => {
    state.settings.autoLockMinutes = Number(document.getElementById("autoLockMinutes").value || 20);
    state.layout = document.getElementById("layoutSelect").value;
    state.theme = document.getElementById("themeSelect").value;
    storage.set("paperwork.settings", state.settings);
    setTheme(state.theme);
    setLayout(state.layout);
    document.getElementById("settingsModal").classList.add("hidden");
    showToast("Settings saved");
  });

  document.getElementById("closeSettingsBtn").addEventListener("click", () => {
    document.getElementById("settingsModal").classList.add("hidden");
  });
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function hashPassword(password, salt) {
  const key = await deriveKey(password, salt);
  const raw = await crypto.subtle.exportKey("raw", key);
  return Array.from(new Uint8Array(raw)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureMasterPasswordSetup() {
  const salt = storage.get("paperwork.auth.salt", "");
  const hash = storage.get("paperwork.auth.hash", "");
  if (!salt || !hash) {
    state.auth.masterSalt = crypto.randomUUID().replace(/-/g, "");
    return false;
  }
  state.auth.masterSalt = salt;
  state.auth.masterHash = hash;
  return true;
}

async function setMasterPassword(password) {
  const salt = crypto.randomUUID().replace(/-/g, "");
  const hash = await hashPassword(password, salt);
  storage.set("paperwork.auth.salt", salt);
  storage.set("paperwork.auth.hash", hash);
  state.auth.masterSalt = salt;
  state.auth.masterHash = hash;
  return true;
}

async function unlockWithPassword(password) {
  if (!state.auth.masterSalt) {
    await setMasterPassword(password);
    state.auth.key = await deriveKey(password, state.auth.masterSalt);
    state.auth.locked = false;
    return true;
  }

  const hash = await hashPassword(password, state.auth.masterSalt);
  const match = hash === state.auth.masterHash;
  if (!match) return false;

  state.auth.key = await deriveKey(password, state.auth.masterSalt);
  state.auth.locked = false;
  return true;
}

async function lockWorkspace() {
  state.auth.key = null;
  state.auth.locked = true;
  state.vault.unlocked = false;
  showToast("Workspace locked");
  renderVault();
}

async function encryptPayload(payload) {
  if (!state.auth.key) throw new Error("No active key");
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, state.auth.key, enc.encode(JSON.stringify(payload)));
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) };
}

async function decryptPayload(obj) {
  if (!state.auth.key) throw new Error("No active key");
  const iv = Uint8Array.from(obj.iv || []);
  const data = Uint8Array.from(obj.data || []);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, state.auth.key, data);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function loadVaultData() {
  try {
    const record = await readDB("vault", "vault-list");
    if (!record) {
      state.vault.entries = [];
      return;
    }
    const decrypt = await decryptPayload(record.value);
    state.vault.entries = Array.isArray(decrypt) ? decrypt : [];
  } catch {
    state.vault.entries = [];
  }
}

async function saveVaultData() {
  if (!state.auth.key) return;
  const encrypted = await encryptPayload(state.vault.entries);
  await writeDB("vault", { id: "vault-list", value: encrypted });
}

function renderVault() {
  const vaultGrid = document.getElementById("vaultGrid");
  if (!state.vault.unlocked) {
    vaultGrid.innerHTML = '<div class="vault-card"><strong>Vault locked</strong><div class="meta">Unlock with the master password.</div></div>';
    return;
  }

  if (!state.vault.entries.length) {
    vaultGrid.innerHTML = '<div class="vault-card"><strong>No vault entries</strong><div class="meta">Add encrypted items.</div></div>';
    return;
  }

  vaultGrid.innerHTML = state.vault.entries.map((entry) => `
    <div class="vault-card">
      <strong>${entry.name}</strong>
      <div class="meta">${entry.type}</div>
      <div class="meta">${new Date(entry.createdAt).toLocaleDateString()}</div>
    </div>
  `).join("");
}

async function openVault() {
  if (state.auth.locked) {
    openAuthModal("unlock");
    return;
  }
  state.vault.unlocked = true;
  await loadVaultData();
  renderVault();
  showView("vault");
}

function openAuthModal(mode = "unlock") {
  const authModal = document.getElementById("authModal");
  const title = document.getElementById("authTitle");
  const subtitle = document.getElementById("authSubtitle");
  title.textContent = mode === "setup" ? "Create master password" : "Master password";
  subtitle.textContent = mode === "setup" ? "Set your first master password." : "Unlock the workspace and private vault.";
  authModal.classList.remove("hidden");
  document.getElementById("authInput").focus();
}

document.getElementById("authSubmitBtn").addEventListener("click", async () => {
  const password = document.getElementById("authInput").value;
  if (!password) {
    showToast("Password required");
    return;
  }

  const exists = await ensureMasterPasswordSetup();
  if (!exists) {
    await setMasterPassword(password);
    state.auth.key = await deriveKey(password, state.auth.masterSalt);
    state.auth.locked = false;
    state.vault.unlocked = true;
    document.getElementById("authModal").classList.add("hidden");
    await loadVaultData();
    renderVault();
    showToast("Master password created");
    return;
  }

  const ok = await unlockWithPassword(password);
  if (!ok) {
    showToast("Password incorrect");
    return;
  }

  state.vault.unlocked = true;
  document.getElementById("authModal").classList.add("hidden");
  await loadVaultData();
  renderVault();
  showToast("Workspace unlocked");
});

document.getElementById("authCancelBtn").addEventListener("click", () => {
  document.getElementById("authModal").classList.add("hidden");
});

document.getElementById("vaultUnlockBtn").addEventListener("click", async () => {
  if (state.auth.locked) {
    openAuthModal("unlock");
  } else {
    state.vault.unlocked = true;
    await loadVaultData();
    renderVault();
  }
});

document.getElementById("vaultAddBtn").addEventListener("click", async () => {
  if (!state.auth.key) {
    openAuthModal("unlock");
    return;
  }

  const entry = {
    id: generateId("vault"),
    name: "Secure Note",
    type: "text",
    content: "Private encrypted content",
    createdAt: new Date().toISOString()
  };

  state.vault.entries.push(entry);
  await saveVaultData();
  renderVault();
  showToast("Vault item added");
});

function loadPortfolioState() {
  const stored = storage.get("paperwork.portfolio", null);
  if (stored && Array.isArray(stored.pages)) {
    state.portfolio = stored;
  }
  if (!state.portfolio.pages || !state.portfolio.pages.length) {
    state.portfolio = {
      pages: [
        { id: generateId("portfolio-page"), name: "Home", sections: ["hero", "projects", "contact"], theme: "default" },
        { id: generateId("portfolio-page"), name: "About", sections: ["bio"], theme: "default" },
        { id: generateId("portfolio-page"), name: "Contact", sections: ["contact"], theme: "default" }
      ],
      activePageId: null
    };
  }
  state.portfolio.activePageId = state.portfolio.pages[0]?.id || null;
}

function renderPortfolio() {
  const pagesEl = document.getElementById("portfolioPages");
  const builderEl = document.getElementById("portfolioBuilder");

  if (!state.portfolio.pages.length) {
    pagesEl.innerHTML = '<div class="list-item">No portfolio pages</div>';
    builderEl.innerHTML = '<div class="builder-section">No portfolio content</div>';
    return;
  }

  const activePage = state.portfolio.pages.find((page) => page.id === state.portfolio.activePageId) || state.portfolio.pages[0];
  state.portfolio.activePageId = activePage.id;

  pagesEl.innerHTML = state.portfolio.pages.map((page) => `
    <div class="page-node">
      <span>${page.name}</span>
      <button class="mini-button" data-page-id="${page.id}">Open</button>
    </div>
  `).join("");

  builderEl.innerHTML = `
    <div class="builder-section">
      <label>Page name</label>
      <input id="portfolioPageName" value="${escapeHtml(activePage.name)}" />
      <label>Theme</label>
      <select id="portfolioTheme">
        <option value="default" ${activePage.theme === "default" ? "selected" : ""}>Default</option>
        <option value="midnight" ${activePage.theme === "midnight" ? "selected" : ""}>Midnight</option>
        <option value="sunset" ${activePage.theme === "sunset" ? "selected" : ""}>Sunset</option>
      </select>
      <button id="portfolioSavePageBtn" class="action-button secondary">Save page</button>
    </div>
    <div class="builder-section">
      <h4>Sections</h4>
      <div>${(activePage.sections || []).map((section) => `<div class="list-item">${section}</div>`).join("")}</div>
    </div>
  `;

  pagesEl.querySelectorAll("[data-page-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.portfolio.activePageId = button.dataset.pageId;
      renderPortfolio();
    });
  });

  document.getElementById("portfolioSavePageBtn").addEventListener("click", () => {
    const page = state.portfolio.pages.find((item) => item.id === activePage.id);
    if (!page) return;
    page.name = document.getElementById("portfolioPageName").value || "Untitled";
    page.theme = document.getElementById("portfolioTheme").value;
    storage.set("paperwork.portfolio", state.portfolio);
    showToast("Portfolio page saved");
  });

  document.getElementById("portfolioAddPageBtn").addEventListener("click", () => {
    const page = {
      id: generateId("portfolio-page"),
      name: `Page ${state.portfolio.pages.length + 1}`,
      theme: "default",
      sections: ["hero", "projects", "contact"]
    };
    state.portfolio.pages.push(page);
    state.portfolio.activePageId = page.id;
    storage.set("paperwork.portfolio", state.portfolio);
    renderPortfolio();
  });

  document.getElementById("portfolioPreviewBtn").addEventListener("click", () => {
    const html = buildPortfolioHTML(state.portfolio, false);
    const preview = window.open("", "_blank", "width=1100,height=800");
    preview.document.write(html);
    preview.document.close();
  });

  document.getElementById("portfolioExportBtn").addEventListener("click", () => {
    const html = buildPortfolioHTML(state.portfolio, true);
    downloadFile("client-portfolio.html", html, "text/html");
    showToast("Client portfolio exported");
  });
}

function buildPortfolioHTML(portfolioState, clientOnly) {
  const page = portfolioState.pages.find((p) => p.id === portfolioState.activePageId) || portfolioState.pages[0];
  const nav = (portfolioState.pages || []).map((item) => `<a href="#${item.id}">${escapeHtml(item.name)}</a>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(page.name || "Portfolio")}</title>
    <style>
      body { margin:0; font-family:system-ui,sans-serif; background:#0b1020; color:#ecf7ff; }
      .wrap { max-width:1100px; margin:0 auto; padding:32px; }
      nav { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:20px; }
      nav a { color:#dbeafe; text-decoration:none; background:#111827; border:1px solid rgba(255,255,255,0.08); border-radius:999px; padding:8px 12px; }
      .card { background:#111827; border:1px solid rgba(255,255,255,0.08); border-radius:18px; padding:20px; margin-top:20px; }
      .hero { display:grid; grid-template-columns:1.2fr .8fr; gap:24px; }
      .button { display:inline-block; background:linear-gradient(135deg,#8b5cf6,#06b6d4); color:white; text-decoration:none; padding:10px 16px; border-radius:10px; }
      .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:18px; }
      .project { background:#0f172a; border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:16px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <nav>${nav}</nav>
      <section class="card hero">
        <div>
          <h1>${escapeHtml(page.name || "Portfolio")}</h1>
          <p>Created locally in Paperwork Lite. This export is client-safe and read-only.</p>
          <a class="button" href="#contact">Contact</a>
        </div>
        <div>
          <div style="background:linear-gradient(135deg,#7c3aed,#06b6d4); height:220px; border-radius:18px;"></div>
        </div>
      </section>

      <section class="card">
        <h2>Projects</h2>
        <div class="grid">
          ${Array.from({ length: 3 }, (_, i) => `<div class="project"><h3>Project ${i + 1}</h3><p>Portfolio content generated in client mode.</p></div>`).join("")}
        </div>
      </section>

      <section id="contact" class="card">
        <h2>Contact</h2>
        <p>Email: hello@example.com</p>
      </section>
    </div>
  </body>
</html>`;
}

async function initialize() {
  db = await openDB();
  loadWorkspace();
  loadPortfolioState();

  const storedTheme = storage.get("paperwork.theme", "light");
  const storedLayout = storage.get("paperwork.layout", "desktop");
  state.theme = storedTheme;
  state.layout = storedLayout;
  setTheme(state.theme);
  setLayout(state.layout);
  updateSettingsControls();

  setupNavigation();
  setupEditor();
  setupSettings();
  initCompanions();

  const setupExists = await ensureMasterPasswordSetup();
  if (!setupExists) {
    openAuthModal("setup");
  }

  renderAll();
  showView("home");

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }
}

window.addEventListener("DOMContentLoaded", initialize);
