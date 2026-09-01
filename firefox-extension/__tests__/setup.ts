// Jest setup file for browser API mocking

// Mock the browser API completely
const mockBrowser = {
  tabs: {
    create: jest.fn(),
    remove: jest.fn(),
    query: jest.fn(),
    get: jest.fn(),
    executeScript: jest.fn(),
    move: jest.fn(),
    update: jest.fn(),
    group: jest.fn(),
    captureVisibleTab: jest.fn(),
    captureTab: jest.fn(),
    reload: jest.fn(),
    onUpdated: { addListener: jest.fn(), removeListener: jest.fn() },
    onRemoved: { addListener: jest.fn() },
  },
  contentScripts: {
    register: jest.fn(),
  },
  downloads: {
    download: jest.fn(),
    search: jest.fn(),
    onChanged: { addListener: jest.fn(), removeListener: jest.fn() },
  },
  webNavigation: {
    onCommitted: { addListener: jest.fn() },
    getAllFrames: jest.fn().mockResolvedValue([]),
  },
  browserAction: {
    setBadgeText: jest.fn().mockResolvedValue(undefined),
    setBadgeBackgroundColor: jest.fn().mockResolvedValue(undefined),
    onClicked: { addListener: jest.fn() },
  },
  tabGroups: {
    update: jest.fn(),
  },
  history: {
    search: jest.fn(),
  },
  find: {
    find: jest.fn(),
    highlightResults: jest.fn(),
  },
  storage: {
    local: {
        get: jest.fn(),
        set: jest.fn(),
    },
  },
  permissions: {
    contains: jest.fn(),
  },
  runtime: {
    getURL: jest.fn(),
  },
  i18n: {
    getMessage: jest.fn((key: string) => key),
  },
};

// Override the global browser object
Object.defineProperty(global, 'browser', {
  value: mockBrowser,
  writable: true,
  configurable: true,
});

// Export for use in tests
export { mockBrowser };

// jsdom hands every test the same window, and refs now outlive a read, so without this a test
// inherits the ref numbers of the one before it instead of starting on a fresh document.
beforeEach(() => {
  const page = window as unknown as Record<string, unknown>;
  delete page.__bcmRefs;
  delete page.__bcmRefOf;
  delete page.__bcmRefSeq;
});
