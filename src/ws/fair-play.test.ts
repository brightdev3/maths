import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { io, type Socket } from "socket.io-client";
import { createWSServer } from "./index.server";
import { DEFAULT_ROOM_SETTINGS, type RoomSocketData } from "../lib/mathex/schemas";

test("fair play warnings are validated, private, retained on reconnect and separate from flags", async () => {
  const base = createServer();
  const oldPath = process.env.MATHEX_DB_PATH;
  process.env.MATHEX_DB_PATH = ":memory:";
  const server = createWSServer(base);
  if (oldPath === undefined) delete process.env.MATHEX_DB_PATH;
  else process.env.MATHEX_DB_PATH = oldPath;
  const clients: Socket[] = [];
  await new Promise<void>((resolve) => base.listen(0, "127.0.0.1", resolve));
  const address = base.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  const origin = `http://127.0.0.1:${address.port}`;

  async function connect(namespace: string, query?: Record<string, string>) {
    const client = io(`${origin}${namespace}`, { transports: ["websocket"], forceNew: true, query });
    clients.push(client);
    await event<undefined>(client, "connect");
    return client;
  }

  function event<T>(socket: Socket, name: string, matches: (value: T) => boolean = () => true): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(name, listener);
        reject(new Error(`Timed out waiting for ${name}`));
      }, 3000);
      const listener = (value: T) => {
        if (!matches(value)) return;
        clearTimeout(timer);
        socket.off(name, listener);
        resolve(value);
      };
      socket.on(name, listener);
    });
  }

  try {
    const creator = await connect("/rooms");
    const destination = event<string>(creator, "goto");
    creator.emit(
      "newRoom",
      "Fair play test",
      [
        {
          contents: "What is 1 + 1?",
          solutions: [{ type: "number", value: 2 }],
          allowEquivalent: false
        }
      ],
      1000,
      true,
      { ...DEFAULT_ROOM_SETTINGS, blockClipboard: true }
    );
    const url = new URL(await destination, origin);
    const id = url.searchParams.get("id")!;
    const host = await connect(`/manage-${id}`, { runToken: url.searchParams.get("runToken")! });
    const player = await connect(`/room-${id}`);
    let latest: RoomSocketData | undefined;
    host.on("playerData", (players: RoomSocketData[]) => {
      latest = players.find((p) => p.name === "Player");
    });
    const joined = event(player, "joined");
    player.emit("join", "Player", "test-player");
    await joined;

    // A barrier on the same socket ensures the warning handler ran before assertions.
    async function warning(kind: unknown, client = player) {
      const processed = new Promise<void>((resolve) => {
        server.io.of(`/room-${id}`).sockets.get(client.id!)!.once("testBarrier", resolve);
      });
      client.emit("fairPlayWarning", kind);
      client.emit("testBarrier");
      await processed;
    }
    const storedPlayer = () => server.io.of(`/room-${id}`).sockets.get(player.id!)!.data as RoomSocketData;
    await warning("copy"); // lobby: ignored
    expect(storedPlayer().fairPlayWarnings).toEqual([]);
    const started = event(player, "gameStart");
    host.emit("start");
    await started;

    await warning("constructor");
    await warning({ kind: "copy" });
    await warning("focus-loss"); // disabled
    expect(storedPlayer().fairPlayWarnings).toEqual([]);
    const stranger = await connect(`/room-${id}`);
    await warning("copy", stranger); // not joined
    expect(storedPlayer().fairPlayWarnings).toEqual([]);

    let leaked = false;
    player.on("playerData", () => {
      leaked = true;
    });
    player.on("log", () => {
      leaked = true;
    });
    const warningUpdate = event<RoomSocketData[]>(
      host,
      "playerData",
      (players) => !!players[0]?.fairPlayWarnings?.length
    );
    await warning("copy");
    await warningUpdate;
    expect(latest?.fairPlayWarnings?.[0].kind).toBe("copy");
    expect(latest?.fairPlayWarnings?.[0].count).toBe(1);
    expect(latest?.visibilityFlags).toBe(0);
    expect(latest?.correctCount).toBe(0);
    await warning("copy"); // duplicate within cooldown
    expect(storedPlayer().fairPlayWarnings?.[0].count).toBe(1);

    const settings = event(host, "roomSettings");
    host.emit("updateSettings", { blockClipboard: false, warnOnFocusLoss: true, protectQuestionContent: true });
    await settings;
    await warning("paste");
    expect(storedPlayer().fairPlayWarnings).toHaveLength(1);
    await warning("focus-loss");
    expect(storedPlayer().fairPlayWarnings).toHaveLength(2);

    // Individual finish: other players can still be playing in this room.
    storedPlayer().finishingTime = Date.now();
    await warning("drag");
    expect(storedPlayer().fairPlayWarnings).toHaveLength(2);
    player.emit("answer", 2);
    player.emit("skip");
    await warning("drag"); // processing barrier for the answer and skip events
    expect(storedPlayer().isRunning).toBe(false);
    expect(storedPlayer().skips).toBe(0);
    storedPlayer().finishingTime = null;

    const reconnected = await connect(`/room-${id}`);
    const rejoined = event(reconnected, "joined");
    reconnected.emit("join", "Player", "test-player");
    await rejoined;
    await warning("focus-loss", reconnected);
    expect(storedPlayer().fairPlayWarnings?.[1].count).toBe(1);

    const hostReconnect = await connect(`/manage-${id}`, { runToken: url.searchParams.get("runToken")! });
    const snapshot = await event<RoomSocketData[]>(hostReconnect, "playerData");
    expect(snapshot[0].fairPlayWarnings).toHaveLength(2);
    const finished = event(player, "gameFinish");
    host.emit("finish");
    await finished;
    const finalWarnings = structuredClone(storedPlayer().fairPlayWarnings);
    await warning("context-menu"); // enabled and not previously reported (no cooldown masking)
    expect(storedPlayer().fairPlayWarnings).toEqual(finalWarnings);
    expect(leaked).toBe(false);
  } finally {
    for (const client of clients) client.disconnect();
    server.flush();
    await new Promise<void>((resolve) => server.io.close(() => resolve()));
  }
}, 15000);
