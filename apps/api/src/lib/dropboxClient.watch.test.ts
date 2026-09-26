import { afterEach, describe, expect, it, vi } from "vitest";

const longpollQueue: Array<() => Promise<{ result: { changes: boolean; backoff?: number } }>> = [];
const dropboxCalls = { longpoll: 0, continue: 0 };

vi.mock("dropbox", () => ({
  Dropbox: class {
    filesListFolderGetLatestCursor() {
      return Promise.resolve({ result: { cursor: "cursor-0" } });
    }
    filesListFolderLongpoll() {
      dropboxCalls.longpoll += 1;
      const next = longpollQueue.shift();
      // Sem mudanca programada: fica "pendurado" como o longpoll real.
      return next ? next() : new Promise(() => undefined);
    }
    filesListFolderContinue() {
      dropboxCalls.continue += 1;
      return Promise.resolve({ result: { cursor: `cursor-${dropboxCalls.continue}`, has_more: false } });
    }
  },
}));

vi.mock("./env.js", () => ({ env: {} }));
vi.mock("./logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { watchDropboxFolder } = await import("./dropboxClient.js");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
  longpollQueue.length = 0;
  dropboxCalls.longpoll = 0;
  dropboxCalls.continue = 0;
});

describe("watchDropboxFolder", () => {
  it("dispara assim que a planilha e salva no Dropbox", async () => {
    longpollQueue.push(() => Promise.resolve({ result: { changes: true } }));
    const onChange = vi.fn();

    const watcher = watchDropboxFolder("/XP SALDO TEMPORARIO", onChange, { debounceMs: 30 });
    await sleep(80);
    watcher.close();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(dropboxCalls.continue).toBe(1);
  });

  it("varios eventos seguidos do mesmo salvamento viram uma unica checagem", async () => {
    for (let index = 0; index < 3; index += 1) {
      longpollQueue.push(() => Promise.resolve({ result: { changes: true } }));
    }
    const onChange = vi.fn();

    const watcher = watchDropboxFolder("/XP SALDO TEMPORARIO", onChange, { debounceMs: 40 });
    await sleep(120);
    watcher.close();

    expect(dropboxCalls.continue).toBe(3);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("nao dispara sem mudanca", async () => {
    longpollQueue.push(() => Promise.resolve({ result: { changes: false } }));
    const onChange = vi.fn();

    const watcher = watchDropboxFolder("/XP SALDO TEMPORARIO", onChange, { debounceMs: 10 });
    await sleep(50);
    watcher.close();

    expect(onChange).not.toHaveBeenCalled();
  });
});
