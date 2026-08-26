import {
  DEFAULT_URL_SCOPE,
  isUrlInScope,
  normalizeUrlScope,
} from "../extension-config";

const SCOPES = ["https", "loopback", "any"] as const;

describe("isUrlInScope", () => {
  it("allows https in every scope", () => {
    for (const scope of SCOPES) {
      expect(isUrlInScope("https://example.com/", scope)).toBe(true);
    }
  });

  it("rejects http in the https scope", () => {
    expect(isUrlInScope("http://localhost:5173/", "https")).toBe(false);
    expect(isUrlInScope("http://example.com/", "https")).toBe(false);
  });

  it("allows only loopback http in the loopback scope", () => {
    expect(isUrlInScope("http://localhost:5173/", "loopback")).toBe(true);
    expect(isUrlInScope("http://127.0.0.1:8080/app", "loopback")).toBe(true);
    expect(isUrlInScope("http://[::1]:3000/", "loopback")).toBe(true);
    expect(isUrlInScope("http://app.localhost/", "loopback")).toBe(true);
    expect(isUrlInScope("http://example.com/", "loopback")).toBe(false);
    expect(isUrlInScope("http://notlocalhost.com/", "loopback")).toBe(false);
  });

  it("allows any http in the any scope", () => {
    expect(isUrlInScope("http://example.com/", "any")).toBe(true);
  });

  it("judges view-source by the document it shows", () => {
    for (const scope of SCOPES) {
      expect(isUrlInScope("view-source:https://example.com/", scope)).toBe(true);
    }
    expect(isUrlInScope("view-source:http://example.com/", "https")).toBe(false);
    expect(isUrlInScope("view-source:http://example.com/", "any")).toBe(true);
    expect(isUrlInScope("view-source:http://localhost:5173/", "loopback")).toBe(
      true
    );
    expect(isUrlInScope("view-source:http://example.com/", "loopback")).toBe(
      false
    );
  });

  it("rejects a view-source wrapper around a scheme no scope covers", () => {
    for (const scope of SCOPES) {
      expect(isUrlInScope("view-source:javascript:alert(1)", scope)).toBe(false);
      expect(isUrlInScope("view-source:file:///etc/passwd", scope)).toBe(false);
    }
  });

  it("rejects every scheme other than http and https", () => {
    for (const scope of SCOPES) {
      expect(isUrlInScope("javascript:alert(1)", scope)).toBe(false);
      expect(isUrlInScope("data:text/html,hello", scope)).toBe(false);
      expect(isUrlInScope("file:///etc/passwd", scope)).toBe(false);
      expect(isUrlInScope("ftp://example.com/pub", scope)).toBe(false);
      expect(isUrlInScope("about:config", scope)).toBe(false);
      expect(isUrlInScope("chrome://browser/content/", scope)).toBe(false);
      expect(isUrlInScope("blob:https://example.com/abc", scope)).toBe(false);
      expect(isUrlInScope("not a url", scope)).toBe(false);
    }
  });

  it("defaults to allowing loopback http", () => {
    expect(DEFAULT_URL_SCOPE).toBe("loopback");
    expect(isUrlInScope("http://127.0.0.1:8080/", DEFAULT_URL_SCOPE)).toBe(true);
  });
});

describe("normalizeUrlScope", () => {
  it("reads the widest scope of an earlier build as any", () => {
    expect(normalizeUrlScope("files")).toBe("any");
    expect(normalizeUrlScope("all")).toBe("any");
  });

  it("keeps every known scope", () => {
    for (const scope of SCOPES) {
      expect(normalizeUrlScope(scope)).toBe(scope);
    }
  });

  it("falls back to the default for anything else", () => {
    expect(normalizeUrlScope(undefined)).toBe(DEFAULT_URL_SCOPE);
    expect(normalizeUrlScope("nonsense")).toBe(DEFAULT_URL_SCOPE);
  });
});
