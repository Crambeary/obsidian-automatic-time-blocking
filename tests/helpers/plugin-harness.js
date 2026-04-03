const path = require("node:path");

const {
  App,
  MarkdownView,
  TFile,
  TFolder,
  Notice,
  resetNotices,
} = require("./obsidian-test-environment.js");

class InMemoryVault {
  constructor(files) {
    this.files = new Map();
    this.events = new Map();
    this.root = new TFolder("");

    for (const [filePath, content] of Object.entries(files)) {
      this.files.set(
        normalizePath(filePath),
        new TFile(normalizePath(filePath), content),
      );
    }

    this.rebuildTree();
  }

  rebuildTree() {
    this.root.children = [];
    const folders = new Map([["", this.root]]);

    for (const file of this.files.values()) {
      const segments = file.path.split("/");
      const folderSegments = segments.slice(0, -1);
      let currentPath = "";
      let parentFolder = this.root;

      for (const segment of folderSegments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        let folder = folders.get(currentPath);
        if (!folder) {
          folder = new TFolder(currentPath);
          folder.name = segment;
          folder.parent = parentFolder;
          parentFolder.children.push(folder);
          folders.set(currentPath, folder);
        }
        parentFolder = folder;
      }

      file.parent = parentFolder;
      if (!parentFolder.children.includes(file)) {
        parentFolder.children.push(file);
      }
    }
  }

  on(eventName, callback) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }
    this.events.get(eventName).push(callback);
    return { eventName, callback };
  }

  trigger(eventName, payload) {
    for (const callback of this.events.get(eventName) ?? []) {
      callback(payload);
    }
  }

  async read(file) {
    return this.getFileContent(file.path);
  }

  async cachedRead(file) {
    return this.getFileContent(file.path);
  }

  async modify(file, content) {
    const normalizedPath = normalizePath(file.path);
    const existing = this.files.get(normalizedPath);
    if (!existing) {
      throw new Error(`Unknown file: ${normalizedPath}`);
    }

    existing.stat.mtime = Date.now();
    existing.stat.size = content.length;
    this.files.set(normalizedPath, existing);
    this[`content:${normalizedPath}`] = content;
    return undefined;
  }

  getFileContent(filePath) {
    const normalizedPath = normalizePath(filePath);
    if (!this.files.has(normalizedPath)) {
      throw new Error(`Unknown file: ${normalizedPath}`);
    }

    return this[`content:${normalizedPath}`] ?? "";
  }

  setFileContent(filePath, content) {
    const normalizedPath = normalizePath(filePath);
    const file = this.files.get(normalizedPath);
    if (!file) {
      throw new Error(`Unknown file: ${normalizedPath}`);
    }

    file.stat.mtime = Date.now();
    file.stat.size = content.length;
    this[`content:${normalizedPath}`] = content;
  }

  getAbstractFileByPath(filePath) {
    const normalizedPath = normalizePath(filePath);
    if (this.files.has(normalizedPath)) {
      return this.files.get(normalizedPath);
    }

    if (normalizedPath.length === 0) {
      return this.root;
    }

    return this.findFolder(normalizedPath);
  }

  findFolder(folderPath) {
    const normalizedPath = normalizePath(folderPath);
    const segments = normalizedPath.split("/").filter(Boolean);
    let currentFolder = this.root;

    for (const segment of segments) {
      const nextFolder = currentFolder.children.find(
        (child) => child instanceof TFolder && child.name === segment,
      );
      if (!nextFolder) {
        return null;
      }
      currentFolder = nextFolder;
    }

    return currentFolder;
  }

  getMarkdownFiles() {
    return [...this.files.values()].filter((file) => file.extension === "md");
  }

  getAllLoadedFiles() {
    const allFolders = [];
    const queue = [this.root];

    while (queue.length > 0) {
      const current = queue.shift();
      allFolders.push(current);
      for (const child of current.children) {
        if (child instanceof TFolder) {
          queue.push(child);
        }
      }
    }

    return [...allFolders, ...this.files.values()];
  }
}

class InMemoryWorkspace {
  constructor(activeFile) {
    this.activeView = activeFile ? new MarkdownView(activeFile) : null;
  }

  getActiveViewOfType(ViewType) {
    if (!this.activeView) {
      return null;
    }

    return this.activeView instanceof ViewType ? this.activeView : null;
  }
}

function normalizePath(value) {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

async function createPluginHarness({
  pluginClass,
  files,
  activeFilePath,
  settings,
  data,
}) {
  const normalizedFiles = {};
  for (const [filePath, content] of Object.entries(files)) {
    normalizedFiles[normalizePath(filePath)] = content;
  }

  const vault = new InMemoryVault(normalizedFiles);
  for (const [filePath, content] of Object.entries(normalizedFiles)) {
    vault.setFileContent(filePath, content);
  }

  const activeFile = vault.getAbstractFileByPath(activeFilePath);
  const workspace = new InMemoryWorkspace(activeFile);
  const app = new App(vault, workspace);
  const plugin = new pluginClass(app);
  plugin.__data = data ?? null;

  resetNotices();
  await plugin.loadSettings();
  plugin.settings = { ...plugin.settings, ...settings };

  return {
    app,
    plugin,
    vault,
    workspace,
    getNoticeMessages() {
      return [...Notice.messages];
    },
    getFileContent(filePath) {
      return vault.getFileContent(filePath);
    },
    setFileContent(filePath, content) {
      vault.setFileContent(filePath, content);
    },
    async runGenerate() {
      await plugin.generateTimeBlocksForActiveNote();
    },
    async runModify(filePath) {
      const file = vault.getAbstractFileByPath(filePath);
      await plugin.handleVaultFileModify(file);
    },
  };
}

module.exports = {
  createPluginHarness,
  normalizePath,
};
