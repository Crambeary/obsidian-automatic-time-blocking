const Module = require("node:module");
const path = require("node:path");

class TAbstractFile {
  constructor(pathValue) {
    this.path = pathValue;
    this.name = path.basename(pathValue);
    this.parent = null;
  }
}

class TFile extends TAbstractFile {
  constructor(pathValue, content = "") {
    super(pathValue);
    this.basename = path.basename(pathValue, path.extname(pathValue));
    this.extension = path.extname(pathValue).replace(/^\./, "");
    this.stat = { mtime: Date.now(), ctime: Date.now(), size: content.length };
  }
}

class TFolder extends TAbstractFile {
  constructor(pathValue) {
    super(pathValue);
    this.children = [];
  }
}

class MarkdownView {
  constructor(file) {
    this.file = file;
  }
}

class Modal {
  constructor(app) {
    this.app = app;
    this.contentEl = createMockElement();
  }

  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

class FuzzySuggestModal extends Modal {
  setPlaceholder() {}
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = createMockElement();
  }

  display() {}
}

class Setting {
  constructor(containerEl) {
    this.containerEl = containerEl;
  }

  setName() { return this; }
  setDesc() { return this; }
  addText(callback) { if (callback) callback(createTextComponent()); return this; }
  addTextArea(callback) { if (callback) callback(createTextComponent()); return this; }
  addToggle(callback) { if (callback) callback(createToggleComponent()); return this; }
  addDropdown(callback) { if (callback) callback(createDropdownComponent()); return this; }
  addButton(callback) { if (callback) callback(createButtonComponent()); return this; }
  addExtraButton(callback) { if (callback) callback(createButtonComponent()); return this; }
  setClass() { return this; }
}

class Plugin {
  constructor(app) {
    this.app = app;
    this.manifest = { id: "obsidian-atb", name: "Automatic Time Blocking" };
    this.__data = null;
  }

  addCommand() {}
  addRibbonIcon() {}
  addSettingTab() {}
  registerEvent() {}
  registerDomEvent() {}
  registerInterval() {}
  async loadData() { return this.__data; }
  async saveData(data) { this.__data = data; }
}

class App {
  constructor(vault, workspace) {
    this.vault = vault;
    this.workspace = workspace;
    this.plugins = { plugins: {} };
  }
}

class Notice {
  constructor(message) {
    Notice.messages.push(String(message));
    this.message = String(message);
  }
}

Notice.messages = [];

function createMockElement() {
  return {
    empty() {},
    createEl() { return createMockElement(); },
    createDiv() { return createMockElement(); },
    setText() {},
    addClass() {},
    removeClass() {},
  };
}

function createTextComponent() {
  return {
    setPlaceholder() { return this; },
    setValue() { return this; },
    onChange() { return this; },
    inputEl: createMockElement(),
  };
}

function createToggleComponent() {
  return {
    setValue() { return this; },
    onChange() { return this; },
  };
}

function createDropdownComponent() {
  return {
    addOption() { return this; },
    setValue() { return this; },
    onChange() { return this; },
  };
}

function createButtonComponent() {
  return {
    setButtonText() { return this; },
    setTooltip() { return this; },
    setIcon() { return this; },
    onClick() { return this; },
  };
}

async function requestUrl() {
  throw new Error("requestUrl is not available in tests");
}

function installObsidianMock() {
  const originalLoad = Module._load;
  const mockModule = {
    App,
    FuzzySuggestModal,
    MarkdownView,
    Modal,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TAbstractFile,
    TFile,
    TFolder,
    requestUrl,
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "obsidian") {
      return mockModule;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  return {
    mockModule,
    restore() {
      Module._load = originalLoad;
    },
  };
}

function resetNotices() {
  Notice.messages.length = 0;
}

module.exports = {
  App,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  TFolder,
  installObsidianMock,
  resetNotices,
};
