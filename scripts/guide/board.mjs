/**
 * Example leaderboard for the guide screenshots: made-up handles in the app's own
 * "engineer-xxxx" format and points that follow the real points table (src/lib/learn/arena/shared.ts).
 */
const DAY = 86_400_000;
const IST = 330 * 60_000;
const istDate = (t) => new Date(t + IST).toISOString().slice(0, 10);

function weekBounds(now) {
  const today = istDate(now);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const start = new Date(Date.parse(`${today}T00:00:00Z`) - ((dow + 6) % 7) * DAY).toISOString().slice(0, 10);
  const end = new Date(Date.parse(`${start}T00:00:00Z`) + 6 * DAY).toISOString().slice(0, 10);
  return { start, end };
}

const LEAGUES = [
  ["L1", "Intern"],
  ["L2", "Junior"],
  ["L3", "SDE"],
  ["L4", "Senior"],
  ["L5", "Staff"],
  ["L6", "Principal"],
];

export function exampleBoard(period, signedIn, now = Date.now()) {
  const { start, end } = weekBounds(now);
  const me = { name: "Demo L.", points: period === "week" ? 196 : 742 };
  const junior = [
    ["engineer-7c21", 318, 6],
    ["engineer-a90e", 244, 4],
    [me.name, me.points, 2, true],
    ["engineer-03fb", 171, 3],
    ["engineer-d4c8", 138, 1],
    ["engineer-5e6a", 96, 0],
    ["engineer-b177", 64, 1],
    ["engineer-2f90", 41, 0],
    ["engineer-e3d5", 18, 0],
  ];
  const intern = [
    ["engineer-91aa", 205, 2],
    ["engineer-4b0c", 122, 1],
    ["engineer-c6f3", 77, 0],
    ["engineer-08de", 35, 0],
  ];
  // a busier league above, so the overall rank (14th) adds up
  const sde = [
    ["engineer-f1c2", 612, 12], ["engineer-77ab", 540, 9], ["engineer-9d3e", 488, 7], ["engineer-c0a4", 431, 5], ["engineer-36b9", 402, 6],
    ["engineer-e8f7", 377, 4], ["engineer-1a5d", 355, 3], ["engineer-b9e0", 290, 2], ["engineer-04c3", 264, 1], ["engineer-dd61", 233, 2],
  ];
  const promote = (n) => Math.max(1, Math.ceil(n * 0.2));
  const rows = [];
  const push = (list, tier) => {
    list.sort((a, b) => b[1] - a[1]);
    const p = promote(list.length);
    list.forEach(([name, points, streak, isMe], i) =>
      rows.push({ rank: i + 1, name, points, tier, zone: period === "week" && i < p && points >= 60 ? "promote" : null, streak, ...(isMe && signedIn ? { me: true } : {}) }),
    );
  };
  push(junior.filter((r) => signedIn || !r[3]), 1);
  push(intern, 0);
  push(sde, 2);
  const leagues = LEAGUES.map(([code, name], tier) => {
    const n = rows.filter((r) => r.tier === tier).length;
    return { tier, code, name, players: n, promote: n ? promote(n) : 0 };
  });
  return {
    period,
    weekStart: start,
    weekEnd: end,
    generatedAt: new Date(now).toISOString(),
    players: rows.length,
    leagues,
    rows,
    me: signedIn
      ? {
          name: me.name,
          tier: 1,
          points: me.points,
          rank: 3,
          globalRank: 14,
          allTime: 742,
          breakdown: period === "week" ? { lesson: 50, stage: 30, quiz: 21, daily: 65, review: 10, active: 20 } : { lesson: 150, stage: 160, quiz: 48, daily: 124, trial: 80, review: 50, active: 130 },
          dailyStreak: 2,
          dailyToday: false,
        }
      : null,
  };
}
