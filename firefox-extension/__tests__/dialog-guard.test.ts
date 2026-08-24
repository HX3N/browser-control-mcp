import { buildDialogGuardCode } from "../dialog-guard";

interface PageEvent {
  kind: string;
  channel: string;
  text: string;
  id?: string;
}

interface PageGlobals {
  alert: (message?: string) => void;
  confirm: (message?: string) => boolean;
  prompt: (message?: string, fallback?: string) => string;
  print: () => void;
  console: Record<string, jest.Mock>;
  onbeforeunload: unknown;
}

interface Installed {
  sent: PageEvent[];
  page: PageGlobals;
  teardown: () => void;
}

const RELAY_KEY = "__bcmPageEvents";

function install(options: { answered: boolean }): Installed {
  const sent: PageEvent[] = [];
  const page = {
    console: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      log: jest.fn(),
    },
    onbeforeunload: null,
  } as unknown as PageGlobals;

  (window as unknown as { wrappedJSObject: PageGlobals }).wrappedJSObject = page;
  (global as unknown as { exportFunction: unknown }).exportFunction = (
    fn: unknown
  ) => fn;
  (browser.runtime as unknown as { sendMessage: jest.Mock }).sendMessage =
    jest.fn((message: PageEvent) => {
      sent.push(message);
      return options.answered
        ? Promise.resolve(true)
        : new Promise(() => undefined);
    });

  const added: [string, EventListener, unknown][] = [];
  const original = window.addEventListener.bind(window);
  window.addEventListener = ((
    type: string,
    listener: EventListener,
    opts: unknown
  ) => {
    added.push([type, listener, opts]);
    original(type, listener, opts as boolean);
  }) as typeof window.addEventListener;

  new Function(buildDialogGuardCode("error"))();

  window.addEventListener = original;

  return {
    sent,
    page,
    teardown: () =>
      added.forEach(([type, listener, opts]) =>
        window.removeEventListener(type, listener, opts as boolean)
      ),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("dialog guard", () => {
  let live: Installed[] = [];

  afterEach(() => {
    live.forEach((guard) => guard.teardown());
    live = [];
    delete (window as unknown as { __bcmDialogGuard?: boolean })
      .__bcmDialogGuard;
    window.sessionStorage.clear();
  });

  const start = (answered: boolean): Installed => {
    const guard = install({ answered });
    live.push(guard);
    return guard;
  };

  it("answers a confirm and reports what it said", async () => {
    const guard = start(true);

    expect(guard.page.confirm("leave?")).toBe(true);
    await settle();

    expect(
      guard.sent.filter((event) => event.channel === "dialog").map((e) => e.text)
    ).toEqual(["confirm (answered OK): leave?"]);
  });

  it("announces the document it was installed in", async () => {
    const guard = start(true);
    await settle();

    expect(
      guard.sent.filter((event) => event.channel === "guard")
    ).toHaveLength(1);
  });

  it("hands a report the background never answered to the next document", async () => {
    const first = start(false);
    first.page.alert("gone in a redirect");
    await settle();

    window.dispatchEvent(new Event("pagehide"));

    const relayed = JSON.parse(
      window.sessionStorage.getItem(RELAY_KEY) ?? "[]"
    ) as PageEvent[];
    expect(relayed.map((event) => event.text)).toContain(
      "alert: gone in a redirect"
    );

    first.teardown();
    delete (window as unknown as { __bcmDialogGuard?: boolean })
      .__bcmDialogGuard;
    const second = start(true);
    await settle();

    expect(second.sent.map((event) => event.text)).toContain(
      "alert: gone in a redirect"
    );
    expect(window.sessionStorage.getItem(RELAY_KEY)).toBeNull();
  });

  it("carries the same id across the handover so the background can drop the repeat", async () => {
    const first = start(false);
    first.page.alert("said once");
    await settle();
    const original = first.sent[first.sent.length - 1].id;

    window.dispatchEvent(new Event("pagehide"));
    first.teardown();
    delete (window as unknown as { __bcmDialogGuard?: boolean })
      .__bcmDialogGuard;

    const second = start(true);
    await settle();
    const again = second.sent.find((event) => event.text === "alert: said once");

    expect(again?.id).toBe(original);
  });

  it("hands over nothing the background already answered", async () => {
    const guard = start(true);
    guard.page.alert("delivered");
    await settle();

    window.dispatchEvent(new Event("pagehide"));

    expect(window.sessionStorage.getItem(RELAY_KEY)).toBeNull();
  });

  it("suppresses the page's own leave confirmation", () => {
    const guard = start(true);
    guard.page.onbeforeunload = () => "stay?";
    const event = new Event("beforeunload", { cancelable: true });
    const later = jest.fn();
    window.addEventListener("beforeunload", later);

    window.dispatchEvent(event);
    window.removeEventListener("beforeunload", later);

    expect(later).not.toHaveBeenCalled();
  });
});
