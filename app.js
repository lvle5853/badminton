const state = {
  players: [],
  schedule: [],
  scores: {},
};

const els = {
  playerForm: document.querySelector("#playerForm"),
  nameInput: document.querySelector("#nameInput"),
  genderInput: document.querySelector("#genderInput"),
  levelInput: document.querySelector("#levelInput"),
  playerList: document.querySelector("#playerList"),
  playerCount: document.querySelector("#playerCount"),
  matchCountInput: document.querySelector("#matchCountInput"),
  repeatLimitInput: document.querySelector("#repeatLimitInput"),
  generateBtn: document.querySelector("#generateBtn"),
  sampleBtn: document.querySelector("#sampleBtn"),
  scheduleList: document.querySelector("#scheduleList"),
  rankingList: document.querySelector("#rankingList"),
  scheduleNote: document.querySelector("#scheduleNote"),
  tabs: document.querySelectorAll(".tab"),
  views: {
    schedule: document.querySelector("#scheduleView"),
    ranking: document.querySelector("#rankingView"),
    rules: document.querySelector("#rulesView"),
  },
};

const STORAGE_KEY = "badminton-scheduler-state-v1";

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function saveAppState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        players: state.players,
        schedule: state.schedule,
        scores: state.scores,
        settings: {
          matchCount: els.matchCountInput.value,
          repeatLimit: els.repeatLimitInput.value,
        },
      })
    );
  } catch (error) {
    console.warn("保存本地数据失败", error);
  }
}

function loadAppState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.players = Array.isArray(data.players) ? data.players : [];
    state.schedule = Array.isArray(data.schedule) ? data.schedule : [];
    state.scores = data.scores && typeof data.scores === "object" ? data.scores : {};
    if (data.settings?.matchCount) els.matchCountInput.value = data.settings.matchCount;
    if (data.settings?.repeatLimit) els.repeatLimitInput.value = data.settings.repeatLimit;
  } catch (error) {
    console.warn("读取本地数据失败", error);
  }
}

function genderLabel(gender) {
  return gender === "M" ? "男" : "女";
}

function formatLevel(level) {
  return Number.isInteger(level) ? String(level) : level.toFixed(1);
}

function normalizeLevel(level) {
  const clamped = Math.max(1, Math.min(9, level));
  return Math.round(clamped * 2) / 2;
}

function teamType(team) {
  const genders = team.map((player) => player.gender).sort().join("");
  if (genders === "MM") return "男双";
  if (genders === "FF") return "女双";
  return "混双";
}

function teamLevel(team) {
  return team[0].level + team[1].level;
}

function pairKey(a, b) {
  return [a.id, b.id].sort().join("|");
}

function matchKey(match) {
  return [
    pairKey(match.a[0], match.a[1]),
    pairKey(match.b[0], match.b[1]),
  ].sort().join("::");
}

function matchTypeKey(match) {
  return [teamType(match.a), teamType(match.b)].sort().join("-");
}

function matchTypeCost(match) {
  const typeKey = matchTypeKey(match);
  if (typeKey === "混双-男双") return -40;
  return 0;
}

function validGenderMatch(teamA, teamB) {
  const a = teamType(teamA);
  const b = teamType(teamB);
  const key = [a, b].sort().join("-");
  return key !== "女双-男双" && key !== "女双-混双";
}

function renderPlayers() {
  els.playerCount.textContent = `${state.players.length}/13`;

  if (!state.players.length) {
    els.playerList.innerHTML = '<div class="empty-state">还没有参赛人员。</div>';
    return;
  }

  els.playerList.innerHTML = state.players
    .map((player) => `
      <div class="player-row">
        <strong>${escapeHtml(player.name)}</strong>
        <span class="badge">${genderLabel(player.gender)}</span>
        <span class="badge">${formatLevel(player.level)}级</span>
        <button class="remove-btn" type="button" data-remove="${player.id}" aria-label="删除 ${escapeHtml(player.name)}">×</button>
      </div>
    `)
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addPlayer(player) {
  if (state.players.length >= 13) {
    showNote("最多支持 13 人。");
    return;
  }
  state.players.push(player);
  state.schedule = [];
  state.scores = {};
  saveAppState();
  renderAll();
}

function removePlayer(id) {
  state.players = state.players.filter((player) => player.id !== id);
  state.schedule = [];
  state.scores = {};
  saveAppState();
  renderAll();
}

function chooseFour(players) {
  const groups = [];
  for (let i = 0; i < players.length - 3; i += 1) {
    for (let j = i + 1; j < players.length - 2; j += 1) {
      for (let k = j + 1; k < players.length - 1; k += 1) {
        for (let l = k + 1; l < players.length; l += 1) {
          groups.push([players[i], players[j], players[k], players[l]]);
        }
      }
    }
  }
  return groups;
}

function enumerateMatches(players) {
  const matches = [];
  const seen = new Set();

  chooseFour(players).forEach((group) => {
    const pairings = [
      [[group[0], group[1]], [group[2], group[3]]],
      [[group[0], group[2]], [group[1], group[3]]],
      [[group[0], group[3]], [group[1], group[2]]],
    ];

    pairings.forEach(([a, b]) => {
      if (!validGenderMatch(a, b)) return;
      const candidate = { a, b };
      const key = matchKey(candidate);
      if (seen.has(key)) return;
      seen.add(key);
      matches.push({
        ...candidate,
        key,
        typeKey: matchTypeKey(candidate),
        players: [...a, ...b],
        baseCost: baseMatchCost(a, b) + matchTypeCost(candidate),
      });
    });
  });

  return matches;
}

function baseMatchCost(a, b) {
  const diff = Math.abs(teamLevel(a) - teamLevel(b));
  const balanceCost = diff <= 1 ? diff * 34 : diff * diff * 110 + diff * 35;
  const teamSpread = Math.abs(a[0].level - a[1].level) + Math.abs(b[0].level - b[1].level);
  const sameLevelTeams =
    Number(a[0].level === a[1].level) +
    Number(b[0].level === b[1].level);
  const repeatedStrongPair =
    Number(a[0].level === a[1].level && a[0].level >= 4) +
    Number(b[0].level === b[1].level && b[0].level >= 4);
  const repeatedWeakPair =
    Number(a[0].level === a[1].level && a[0].level <= 3) +
    Number(b[0].level === b[1].level && b[0].level <= 3);

  return balanceCost - teamSpread * 3 + sameLevelTeams * 16 + repeatedStrongPair * 24 + repeatedWeakPair * 18;
}

function createInitialStats(players) {
  const stats = {};
  players.forEach((player) => {
    stats[player.id] = {
      id: player.id,
      playStreak: 0,
      restStreak: 0,
      games: 0,
      partners: new Set(),
      opponents: new Set(),
    };
  });
  return stats;
}

function cloneStats(stats) {
  const next = {};
  Object.entries(stats).forEach(([id, value]) => {
    next[id] = {
      playStreak: value.playStreak,
      restStreak: value.restStreak,
      games: value.games,
      partners: new Set(value.partners),
      opponents: new Set(value.opponents),
    };
  });
  return next;
}

function scoreCandidate(match, stats, selectedCounts, selectedTypeCounts, gameIndex, totalGames, playerCount, repeatLimit) {
  let cost = match.baseCost + Math.random() * 4;
  const selectedCount = selectedCounts.get(match.key) || 0;
  const selectedTypeCount = selectedTypeCounts.get(match.typeKey) || 0;
  if (selectedCount >= repeatLimit) cost += 5000 + selectedCount * 1000;
  else if (selectedCount > 0) cost += selectedCount * 180;
  cost += selectedTypeCount * 28;

  const playing = new Set(match.players.map((player) => player.id));
  match.players.forEach((player) => {
    const item = stats[player.id];
    if (item.playStreak >= 2) cost += 900;
    if (item.games > Math.floor((gameIndex * 4) / playerCount) + 2) cost += 18;
  });

  Object.values(stats).forEach((item) => {
    const willPlay = playing.has(item.id);
    if (!willPlay && item.restStreak >= 1) cost += 260;
  });

  const pairA = pairKey(match.a[0], match.a[1]);
  const pairB = pairKey(match.b[0], match.b[1]);
  if (stats[match.a[0].id].partners.has(match.a[1].id)) cost += 42;
  if (stats[match.b[0].id].partners.has(match.b[1].id)) cost += 42;

  const averageGames = ((gameIndex + 1) * 4) / playerCount;
  match.players.forEach((player) => {
    cost += Math.max(0, stats[player.id].games + 1 - averageGames - 1.2) * 20;
  });

  if (pairA === pairB) cost += 999;
  const remaining = totalGames - gameIndex - 1;
  if (remaining <= 2) {
    Object.values(stats).forEach((item) => {
      cost += Math.abs(item.games - averageGames) * 2;
    });
  }

  return cost;
}

function applyMatchToStats(match, stats, players) {
  const playing = new Set(match.players.map((player) => player.id));
  players.forEach((player) => {
    const item = stats[player.id];
    item.id = player.id;
    if (playing.has(player.id)) {
      item.playStreak += 1;
      item.restStreak = 0;
      item.games += 1;
    } else {
      item.playStreak = 0;
      item.restStreak += 1;
    }
  });

  stats[match.a[0].id].partners.add(match.a[1].id);
  stats[match.a[1].id].partners.add(match.a[0].id);
  stats[match.b[0].id].partners.add(match.b[1].id);
  stats[match.b[1].id].partners.add(match.b[0].id);

  match.a.forEach((player) => {
    match.b.forEach((opponent) => stats[player.id].opponents.add(opponent.id));
  });
  match.b.forEach((player) => {
    match.a.forEach((opponent) => stats[player.id].opponents.add(opponent.id));
  });
}

function schedulePenalty(schedule, players, repeatLimit) {
  const history = {};
  const partnerUse = {};
  const matchUse = {};
  const matchTypeUse = {};
  players.forEach((player) => {
    history[player.id] = [];
  });

  schedule.forEach((match) => {
    const playing = new Set(match.players.map((player) => player.id));
    players.forEach((player) => history[player.id].push(playing.has(player.id) ? "P" : "R"));
    [match.a, match.b].forEach((team) => {
      const key = pairKey(team[0], team[1]);
      partnerUse[key] = (partnerUse[key] || 0) + 1;
    });
    matchUse[match.key] = (matchUse[match.key] || 0) + 1;
    matchTypeUse[match.typeKey] = (matchTypeUse[match.typeKey] || 0) + 1;
  });

  let penalty = schedule.reduce((sum, match) => sum + match.baseCost, 0);
  Object.values(history).forEach((items) => {
    items.join("").match(/PPP+/g)?.forEach((run) => {
      penalty += run.length * 1000;
    });
    items.join("").match(/RR+/g)?.forEach((run) => {
      penalty += run.length * 450;
    });
  });
  Object.values(partnerUse).forEach((count) => {
    if (count > 1) penalty += (count - 1) * 48;
  });
  Object.values(matchUse).forEach((count) => {
    if (count > repeatLimit) penalty += (count - repeatLimit) * 5000;
    else if (count > 1) penalty += (count - 1) * 180;
  });
  Object.values(matchTypeUse).forEach((count) => {
    penalty += count * count * 8;
  });
  return penalty;
}

function generateSchedule(players, matchCount, repeatLimit = 2) {
  const candidates = enumerateMatches(players);
  if (!candidates.length) {
    return { schedule: [], note: "当前性别组合下没有合法对阵，请调整人员。" };
  }

  let best = null;
  const attempts = Math.max(160, Math.min(900, matchCount * 70));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const stats = createInitialStats(players);
    const selectedCounts = new Map();
    const selectedTypeCounts = new Map();
    const schedule = [];

    for (let i = 0; i < matchCount; i += 1) {
      const ranked = candidates
        .map((match) => ({
          match,
          cost: scoreCandidate(match, stats, selectedCounts, selectedTypeCounts, i, matchCount, players.length, repeatLimit),
        }))
        .sort((x, y) => x.cost - y.cost);
      const pickIndex = Math.min(ranked.length - 1, Math.floor(Math.random() * 3));
      const chosen = ranked[pickIndex].match;
      const copy = {
        ...chosen,
        index: i + 1,
        a: [...chosen.a],
        b: [...chosen.b],
        players: [...chosen.players],
      };
      schedule.push(copy);
      selectedCounts.set(chosen.key, (selectedCounts.get(chosen.key) || 0) + 1);
      selectedTypeCounts.set(chosen.typeKey, (selectedTypeCounts.get(chosen.typeKey) || 0) + 1);
      applyMatchToStats(chosen, stats, players);
    }

    const penalty = schedulePenalty(schedule, players, repeatLimit);
    if (!best || penalty < best.penalty) {
      best = { schedule, penalty };
    }
  }

  const hardWarnings = collectWarnings(best.schedule, players, repeatLimit);
  return {
    schedule: best.schedule,
    note: hardWarnings.length
      ? `已生成，但存在无法完全避免的情况：${hardWarnings.join("；")}。`
      : "已生成一版满足主要限制的赛程，可直接开始计分。",
  };
}

function collectWarnings(schedule, players, repeatLimit = 2) {
  const history = {};
  const partnerUse = {};
  const matchUse = {};
  players.forEach((player) => {
    history[player.id] = [];
  });
  schedule.forEach((match) => {
    const playing = new Set(match.players.map((player) => player.id));
    players.forEach((player) => history[player.id].push(playing.has(player.id) ? "P" : "R"));
    [match.a, match.b].forEach((team) => {
      const key = pairKey(team[0], team[1]);
      partnerUse[key] = (partnerUse[key] || 0) + 1;
    });
    matchUse[match.key] = (matchUse[match.key] || 0) + 1;
  });

  const warnings = [];
  if (Object.values(history).some((items) => items.join("").includes("PPP"))) {
    warnings.push("有人连续打了 3 场");
  }
  if (Object.values(history).some((items) => items.join("").includes("RR"))) {
    warnings.push("有人连续休息 2 场");
  }
  if (Object.values(partnerUse).some((count) => count > 1)) {
    warnings.push("部分搭档重复");
  }
  if (Object.values(matchUse).some((count) => count > repeatLimit)) {
    warnings.push(`个别完整对阵超过 ${repeatLimit} 次`);
  }
  return warnings;
}

function renderSchedule() {
  if (!state.schedule.length) {
    els.scheduleList.className = "schedule-list empty-state";
    els.scheduleList.textContent = "添加人员后生成赛程。";
    return;
  }

  els.scheduleList.className = "schedule-list";
  els.scheduleList.innerHTML = state.schedule
    .map((match, index) => {
      const score = state.scores[index] || { a: "", b: "" };
      return `
        <article class="match-card">
          <div class="match-head">
            <span>第 ${index + 1} 场</span>
            <span>${teamType(match.a)} vs ${teamType(match.b)} · 实力 ${formatLevel(teamLevel(match.a))}:${formatLevel(teamLevel(match.b))}</span>
          </div>
          <div class="match-body">
            ${renderTeam(match.a)}
            <div class="versus">VS</div>
            ${renderTeam(match.b)}
          </div>
          <div class="score-row">
            <input data-score="${index}" data-side="a" type="number" min="0" max="30" value="${score.a}" placeholder="左队">
            <input data-score="${index}" data-side="b" type="number" min="0" max="30" value="${score.b}" placeholder="右队">
            <button type="button" data-clear-score="${index}">清空</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTeam(team) {
  return `
    <div class="team">
      <div class="team-name">${team.map((player) => escapeHtml(player.name)).join("/")}</div>
      <div class="team-meta">${team.map((player) => `${genderLabel(player.gender)} ${formatLevel(player.level)}级`).join(" · ")}</div>
    </div>
  `;
}

function calculateRanking() {
  const rows = state.players.map((player) => ({
    ...player,
    points: 0,
    diff: 0,
    scored: 0,
    games: 0,
    wins: 0,
    losses: 0,
  }));
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

  state.schedule.forEach((match, index) => {
    const score = state.scores[index];
    if (!score || score.a === "" || score.b === "" || Number(score.a) === Number(score.b)) return;
    const aScore = Number(score.a);
    const bScore = Number(score.b);
    const aWin = aScore > bScore;

    match.players.forEach((player) => {
      byId[player.id].games += 1;
    });
    match.a.forEach((player) => {
      byId[player.id].points += aWin ? 2 : 0;
      byId[player.id][aWin ? "wins" : "losses"] += 1;
      byId[player.id].diff += aScore - bScore;
      byId[player.id].scored += aScore;
    });
    match.b.forEach((player) => {
      byId[player.id].points += aWin ? 0 : 2;
      byId[player.id][aWin ? "losses" : "wins"] += 1;
      byId[player.id].diff += bScore - aScore;
      byId[player.id].scored += bScore;
    });
  });

  return rows.sort((a, b) =>
    b.points - a.points ||
    b.diff - a.diff ||
    b.scored - a.scored ||
    b.level - a.level ||
    a.name.localeCompare(b.name, "zh-Hans-CN")
  );
}

function renderRanking() {
  if (!state.players.length) {
    els.rankingList.className = "ranking-list empty-state";
    els.rankingList.textContent = "完成计分后查看排名。";
    return;
  }

  const rows = calculateRanking();
  els.rankingList.className = "ranking-list";
  els.rankingList.innerHTML = `
    <div class="rank-row header">
      <span>名次</span><span>球员</span><span>积分</span><span>胜负</span><span>净胜</span><span>得分</span><span>场次</span>
    </div>
    ${rows.map((row, index) => `
      <div class="rank-row">
        <span>${index + 1}</span>
        <strong>${escapeHtml(row.name)} <span class="badge">${genderLabel(row.gender)} ${formatLevel(row.level)}级</span></strong>
        <span>${row.points}</span>
        <span>${row.wins}胜${row.losses}负</span>
        <span>${row.diff > 0 ? "+" : ""}${row.diff}</span>
        <span>${row.scored}</span>
        <span>${row.games}</span>
      </div>
    `).join("")}
  `;
}

function showNote(message) {
  els.scheduleNote.textContent = message;
}

function renderAll() {
  renderPlayers();
  renderSchedule();
  renderRanking();
}

els.playerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = els.nameInput.value.trim();
  const level = Number(els.levelInput.value);
  if (!name || !Number.isFinite(level)) return;
  addPlayer({
    id: uid(),
    name,
    gender: els.genderInput.value,
    level: normalizeLevel(level),
  });
  els.nameInput.value = "";
  els.nameInput.focus();
});

els.playerList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  removePlayer(button.dataset.remove);
});

els.matchCountInput.addEventListener("change", saveAppState);
els.repeatLimitInput.addEventListener("change", saveAppState);

els.generateBtn.addEventListener("click", () => {
  const count = state.players.length;
  if (count < 4 || count > 13) {
    showNote("请先录入 4-13 名参赛人员。");
    return;
  }

  const matchCount = Math.max(1, Math.min(30, Number(els.matchCountInput.value) || 1));
  const repeatLimit = Math.max(1, Math.min(2, Number(els.repeatLimitInput.value) || 2));
  const result = generateSchedule(state.players, matchCount, repeatLimit);
  state.schedule = result.schedule;
  state.scores = {};
  saveAppState();
  showNote(result.note);
  renderAll();
});

els.scheduleList.addEventListener("input", (event) => {
  const input = event.target.closest("[data-score]");
  if (!input) return;
  const index = input.dataset.score;
  state.scores[index] ||= { a: "", b: "" };
  state.scores[index][input.dataset.side] = input.value;
  saveAppState();
  renderRanking();
});

els.scheduleList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-clear-score]");
  if (!button) return;
  delete state.scores[button.dataset.clearScore];
  saveAppState();
  renderSchedule();
  renderRanking();
});

els.sampleBtn.addEventListener("click", () => {
  state.players = [
    { id: uid(), name: "阿杰", gender: "M", level: 4 },
    { id: uid(), name: "小林", gender: "M", level: 4 },
    { id: uid(), name: "Leo", gender: "M", level: 4 },
    { id: uid(), name: "安安", gender: "F", level: 3 },
    { id: uid(), name: "Mia", gender: "F", level: 3 },
    { id: uid(), name: "小周", gender: "F", level: 3 },
  ];
  els.matchCountInput.value = 9;
  state.schedule = [];
  state.scores = {};
  saveAppState();
  showNote("已填入 6 人示例，可以直接生成赛程。");
  renderAll();
});

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    els.tabs.forEach((item) => item.classList.toggle("active", item === tab));
    Object.entries(els.views).forEach(([name, view]) => {
      view.classList.toggle("active", name === tab.dataset.view);
    });
  });
});

if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.warn("离线缓存注册失败", error);
  });
}

loadAppState();
renderAll();
