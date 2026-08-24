import { DEFAULT_URL_SCOPE, isUrlInScope } from "../extension-config";

describe("isUrlInScope", () => {
  it("allows https in every scope", () => {
    for (const scope of ["https", "loopback", "any", "files"] as const) {
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

  it("rejects non-http schemes and unparsable input in every scope", () => {
    for (const scope of ["https", "loopback", "any"] as const) {
      expect(isUrlInScope("file:///etc/passwd", scope)).toBe(false);
      expect(isUrlInScope("about:config", scope)).toBe(false);
      expect(isUrlInScope("javascript:alert(1)", scope)).toBe(false);
      expect(isUrlInScope("not a url", scope)).toBe(false);
    }
  });

  it("allows file and ftp only in the files scope", () => {
    expect(isUrlInScope("file:///etc/passwd", "files")).toBe(true);
    expect(isUrlInScope("ftp://example.com/pub", "files")).toBe(true);
    expect(isUrlInScope("ftp://example.com/pub", "any")).toBe(false);
  });

  it("keeps the files scope wider than every scope below it", () => {
    expect(isUrlInScope("http://example.com/", "files")).toBe(true);
    expect(isUrlInScope("http://localhost:5173/", "files")).toBe(true);
  });

  it("still rejects schemes no scope covers", () => {
    expect(isUrlInScope("about:config", "files")).toBe(false);
    expect(isUrlInScope("javascript:alert(1)", "files")).toBe(false);
  });

  it("defaults to allowing loopback http", () => {
    expect(DEFAULT_URL_SCOPE).toBe("loopback");
    expect(isUrlInScope("http://127.0.0.1:8080/", DEFAULT_URL_SCOPE)).toBe(true);
  });
});
