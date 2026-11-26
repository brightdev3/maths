import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { io, type Socket } from "socket.io-client";
import { DEFAULT_ROOM_SETTINGS, type LeaderboardEntry, type RoomSocketData } from "../lib/mathex/schemas";
import { playerPoints } from "../lib/mathex/scoring";
import { createWSServer } from "./index.server";

function event<T>(socket: Socket, name: string, matches: (value: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error(`Timed out waiting for ${name}`));
    }, 5000);
    const listener = (value: T) => {
      if (!matches(value)) return;
      clearTimeout(timer);
      socket.off(name, listener);
      resolve(value);
    };
    socket.on(name, listener);
  });
}

test("live and final standings tie-break by when each player earned the score", async () => {
  const base = createServer();
  const oldPath = process.env.MATHEX_DB_PATH;
  process.env.MATHEX_DB_PATH = ":memory:";
  const server = createWSServer(base);
  if (oldPath === undefined) delete process.env.MATHEX_DB_PATH;
  else process.env.MATHEX_DB_PATH = oldPath;
  const clients: Socket[] = [];

  try {
    await new Promise<void>((resolve) => base.listen(0, "127.0.0.1", resolve));
    const address = base.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const origin = `http://127.0.0.1:${address.port}`;

    async function connect(namespace: string, query?: Record<string, string>) {
      const socket = io(`${origin}${namespace}`, { transports: ["websocket"], forceNew: true, query });
      clients.push(socket);
      await event(socket, "connect");
      return socket;
    }

    const creator = await connect("/rooms");
    const destination = event<string>(creator, "goto");
    const question = {
      contents: "What is 1 + 1?",
      solutions: [{ type: "number", value: 2 }],
      allowEquivalent: false
    };
    creator.emit("newRoom", "Standings test", [question, question, question], 1000, false, DEFAULT_ROOM_SETTINGS);
    const url = new URL(await destination, origin);
    const id = url.searchParams.get("id")!;
    const host = await connect(`/manage-${id}`, { runToken: url.searchParams.get("runToken")! });

    async function join(name: string) {
      const player = await connect(`/room-${id}`);
      const joined = event(player, "joined");
      player.emit("join", name, name);
      await joined;
      return player;
    }

    const amy = await join("Amy");
    const zulu = await join("Zulu");
    const started = Promise.all([event(amy, "gameStart"), event(zulu, "gameStart")]);
    host.emit("start");
    await started;

    const firstScore = event<RoomSocketData[]>(host, "playerData", (players) => players[0]?.correctCount === 1);
    const skipped = event(amy, "stopRunning");
    amy.emit("skip");
    zulu.emit("answer", 2);
    const [[first]] = await Promise.all([firstScore, skipped]);
    expect(first.name).toBe("Zulu");
    expect(first.scoreReachedAt).toEqual(expect.any(Number));

    await join("Zero"); // A player who never answers must still have zero points after the host ends the round.

    const tiedPlayers = event<RoomSocketData[]>(host, "playerData", (players) =>
      players.some((player) => player.name === "Amy" && player.correctCount === 1)
    );
    const liveStandings = event<LeaderboardEntry[]>(zulu, "leaderboard", (entries) =>
      entries.some((entry) => entry.name === "Amy" && playerPoints(entry) === 5)
    );
    amy.emit("answer", 2);
    const [players, live] = await Promise.all([tiedPlayers, liveStandings]);
    expect(players.map((player) => player.name)).toEqual(["Zulu", "Amy", "Zero"]);
    expect(players[0].scoreReachedAt).toBe(first.scoreReachedAt);
    expect(players[0].scoreReachedAt!).toBeLessThan(players[1].scoreReachedAt!);

    const expected = [
      [1, "Zulu", 5],
      [2, "Amy", 5],
      [3, "Zero", 0]
    ];
    expect(live.map((entry) => [entry.rank, entry.name, playerPoints(entry)])).toEqual(expected);
    const final = event<LeaderboardEntry[]>(host, "leaderboard");
    host.emit("finish");
    expect((await final).map((entry) => [entry.rank, entry.name, playerPoints(entry)])).toEqual(expected);
  } finally {
    for (const client of clients) client.disconnect();
    server.flush();
    await new Promise<void>((resolve) => server.io.close(() => resolve()));
  }
}, 15000);
