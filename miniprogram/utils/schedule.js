/**
 * 羽毛球排赛核心算法
 * 从原 Web 版 app.js 提取，适配小程序 module.exports
 */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function formatLevel(level) {
  return Number.isInteger(level) ? String(level) : level.toFixed(1)
}

function genderLabel(gender) {
  return gender === 'M' ? '男' : '女'
}

function teamType(team) {
  var genders = team.map(function (p) { return p.gender }).sort().join('')
  if (genders === 'MM') return '男双'
  if (genders === 'FF') return '女双'
  return '混双'
}

function teamLevel(team) {
  return team[0].level + team[1].level
}

function matchLevelDiff(match) {
  return Math.abs(teamLevel(match.a) - teamLevel(match.b))
}

function filterCandidatesByLevelDiff(candidates, maxDiff) {
  return candidates.filter(function (match) {
    return matchLevelDiff(match) <= maxDiff
  })
}

function pairKey(a, b) {
  return [a.id, b.id].sort().join('|')
}

function matchKeyFn(match) {
  return [
    pairKey(match.a[0], match.a[1]),
    pairKey(match.b[0], match.b[1])
  ].sort().join('::')
}

function matchTypeKey(match) {
  return [teamType(match.a), teamType(match.b)].sort().join('-')
}

function matchTypeCost(match) {
  var typeKey = matchTypeKey(match)
  if (typeKey === '混双-男双') return -40
  return 0
}

function validGenderMatch(teamA, teamB) {
  var a = teamType(teamA)
  var b = teamType(teamB)
  var key = [a, b].sort().join('-')
  return key !== '女双-男双' && key !== '女双-混双'
}

function baseMatchCost(a, b) {
  var diff = Math.abs(teamLevel(a) - teamLevel(b))
  var balanceCost = diff <= 1 ? diff * 34 : diff * diff * 110 + diff * 35
  var teamSpread = Math.abs(a[0].level - a[1].level) + Math.abs(b[0].level - b[1].level)
  var sameLevelTeams =
    Number(a[0].level === a[1].level) +
    Number(b[0].level === b[1].level)
  var repeatedStrongPair =
    Number(a[0].level === a[1].level && a[0].level >= 4) +
    Number(b[0].level === b[1].level && b[0].level >= 4)
  var repeatedWeakPair =
    Number(a[0].level === a[1].level && a[0].level <= 3) +
    Number(b[0].level === b[1].level && b[0].level <= 3)

  return balanceCost - teamSpread * 3 + sameLevelTeams * 16 + repeatedStrongPair * 24 + repeatedWeakPair * 18
}

function chooseFour(players) {
  var groups = []
  for (var i = 0; i < players.length - 3; i += 1) {
    for (var j = i + 1; j < players.length - 2; j += 1) {
      for (var k = j + 1; k < players.length - 1; k += 1) {
        for (var l = k + 1; l < players.length; l += 1) {
          groups.push([players[i], players[j], players[k], players[l]])
        }
      }
    }
  }
  return groups
}

function enumerateMatches(players) {
  var matches = []
  var seen = {}

  chooseFour(players).forEach(function (group) {
    var pairings = [
      [[group[0], group[1]], [group[2], group[3]]],
      [[group[0], group[2]], [group[1], group[3]]],
      [[group[0], group[3]], [group[1], group[2]]]
    ]

    pairings.forEach(function (pairing) {
      var a = pairing[0]
      var b = pairing[1]
      if (!validGenderMatch(a, b)) return
      var candidate = { a: a, b: b }
      var key = matchKeyFn(candidate)
      if (seen[key]) return
      seen[key] = true
      matches.push({
        a: a,
        b: b,
        key: key,
        typeKey: matchTypeKey(candidate),
        players: a.concat(b),
        baseCost: baseMatchCost(a, b) + matchTypeCost(candidate)
      })
    })
  })

  return matches
}

function createInitialStats(players) {
  var stats = {}
  players.forEach(function (player) {
    stats[player.id] = {
      id: player.id,
      playStreak: 0,
      restStreak: 0,
      games: 0,
      partners: {},
      opponents: {}
    }
  })
  return stats
}

function getTargetGames(players, matchCount) {
  var totalSlots = matchCount * 4
  return totalSlots % players.length === 0 ? totalSlots / players.length : null
}

function isFeasibleByQuota(match, stats, players, remainingAfter, targetGames) {
  if (targetGames === null) return true

  var playing = {}
  match.players.forEach(function (p) { playing[p.id] = true })

  for (var i = 0; i < players.length; i += 1) {
    var player = players[i]
    var gamesAfter = stats[player.id].games + (playing[player.id] ? 1 : 0)
    if (gamesAfter > targetGames) return false
    if (gamesAfter + remainingAfter < targetGames) return false
  }

  return true
}

function scoreCandidate(match, stats, selectedCounts, selectedTypeCounts, gameIndex, totalGames, playerCount, repeatLimit, targetGames) {
  var cost = match.baseCost + Math.random() * 4
  var selectedCount = selectedCounts[match.key] || 0
  var selectedTypeCount = selectedTypeCounts[match.typeKey] || 0
  if (selectedCount >= repeatLimit) cost += 5000 + selectedCount * 1000
  else if (selectedCount > 0) cost += selectedCount * 180
  cost += selectedTypeCount * 28

  var playing = {}
  match.players.forEach(function (p) { playing[p.id] = true })

  match.players.forEach(function (player) {
    var item = stats[player.id]
    if (item.playStreak >= 2) cost += 900
    if (item.games > Math.floor((gameIndex * 4) / playerCount) + 2) cost += 18
  })

  Object.keys(stats).forEach(function (id) {
    var item = stats[id]
    if (!playing[id] && item.restStreak >= 1) cost += 260
  })

  if (stats[match.a[0].id].partners[match.a[1].id]) cost += 42
  if (stats[match.b[0].id].partners[match.b[1].id]) cost += 42

  var averageGames = ((gameIndex + 1) * 4) / playerCount
  match.players.forEach(function (player) {
    cost += Math.max(0, stats[player.id].games + 1 - averageGames - 1.2) * 20
    if (targetGames !== null) {
      cost += Math.max(0, stats[player.id].games + 1 - targetGames) * 10000
    }
  })

  if (pairKey(match.a[0], match.a[1]) === pairKey(match.b[0], match.b[1])) cost += 999
  var remaining = totalGames - gameIndex - 1
  if (remaining <= 2) {
    Object.keys(stats).forEach(function (id) {
      cost += Math.abs(stats[id].games - averageGames) * 2
    })
  }

  return cost
}

function applyMatchToStats(match, stats, players) {
  var playing = {}
  match.players.forEach(function (p) { playing[p.id] = true })

  players.forEach(function (player) {
    var item = stats[player.id]
    if (playing[player.id]) {
      item.playStreak += 1
      item.restStreak = 0
      item.games += 1
    } else {
      item.playStreak = 0
      item.restStreak += 1
    }
  })

  stats[match.a[0].id].partners[match.a[1].id] = true
  stats[match.a[1].id].partners[match.a[0].id] = true
  stats[match.b[0].id].partners[match.b[1].id] = true
  stats[match.b[1].id].partners[match.b[0].id] = true

  match.a.forEach(function (p) {
    match.b.forEach(function (opp) { stats[p.id].opponents[opp.id] = true })
  })
  match.b.forEach(function (p) {
    match.a.forEach(function (opp) { stats[p.id].opponents[opp.id] = true })
  })
}

function clonePlainObject(obj) {
  var copy = {}
  Object.keys(obj).forEach(function (key) {
    copy[key] = obj[key]
  })
  return copy
}

function cloneStats(stats) {
  var copy = {}
  Object.keys(stats).forEach(function (id) {
    copy[id] = {
      id: stats[id].id,
      playStreak: stats[id].playStreak,
      restStreak: stats[id].restStreak,
      games: stats[id].games,
      partners: clonePlainObject(stats[id].partners),
      opponents: clonePlainObject(stats[id].opponents)
    }
  })
  return copy
}

function cloneCounts(counts) {
  return clonePlainObject(counts)
}

function copyMatch(chosen, index) {
  return {
    a: chosen.a,
    b: chosen.b,
    players: chosen.players,
    key: chosen.key,
    typeKey: chosen.typeKey,
    baseCost: chosen.baseCost,
    index: index + 1
  }
}

function generateWithQuota(players, matchCount, repeatLimit, candidates, targetGames, beamWidth, perStateLimit) {
  beamWidth = beamWidth || (players.length <= 8 ? 72 : 48)
  perStateLimit = perStateLimit || (players.length <= 8 ? 8 : 6)
  var states = [{
    stats: createInitialStats(players),
    selectedCounts: {},
    selectedTypeCounts: {},
    schedule: [],
    cost: 0
  }]

  for (var i = 0; i < matchCount; i += 1) {
    var remainingAfter = matchCount - i - 1
    var nextStates = []

    states.forEach(function (state) {
      var ranked = candidates
        .filter(function (match) {
          return isFeasibleByQuota(match, state.stats, players, remainingAfter, targetGames)
        })
        .map(function (match) {
          return {
            match: match,
            cost: scoreCandidate(match, state.stats, state.selectedCounts, state.selectedTypeCounts, i, matchCount, players.length, repeatLimit, targetGames)
          }
        })
        .sort(function (x, y) { return x.cost - y.cost })
        .slice(0, perStateLimit)

      ranked.forEach(function (item) {
        var nextStats = cloneStats(state.stats)
        var nextSelectedCounts = cloneCounts(state.selectedCounts)
        var nextSelectedTypeCounts = cloneCounts(state.selectedTypeCounts)
        var chosen = item.match
        var nextSchedule = state.schedule.concat([copyMatch(chosen, i)])

        nextSelectedCounts[chosen.key] = (nextSelectedCounts[chosen.key] || 0) + 1
        nextSelectedTypeCounts[chosen.typeKey] = (nextSelectedTypeCounts[chosen.typeKey] || 0) + 1
        applyMatchToStats(chosen, nextStats, players)

        nextStates.push({
          stats: nextStats,
          selectedCounts: nextSelectedCounts,
          selectedTypeCounts: nextSelectedTypeCounts,
          schedule: nextSchedule,
          cost: state.cost + item.cost
        })
      })
    })

    if (!nextStates.length) return null

    nextStates.sort(function (a, b) {
      return a.cost - b.cost
    })
    states = nextStates.slice(0, beamWidth)
  }

  var best = null
  states.forEach(function (state) {
    var penalty = schedulePenalty(state.schedule, players, repeatLimit)
    if (!best || penalty < best.penalty) {
      best = { schedule: state.schedule, penalty: penalty }
    }
  })

  return best
}

function repeatBaseQuotaSchedule(players, matchCount, repeatLimit, candidates) {
  if (matchCount % players.length !== 0) return null
  if ((players.length * 4) % players.length !== 0) return null

  var rounds = matchCount / players.length
  var baseTargetGames = 4
  var base = generateWithQuota(players, players.length, repeatLimit, candidates, baseTargetGames, 260, 14)
  if (!base && repeatLimit < 2) {
    base = generateWithQuota(players, players.length, 2, candidates, baseTargetGames, 260, 14)
  }
  if (!base && repeatLimit < 3) {
    base = generateWithQuota(players, players.length, 3, candidates, baseTargetGames, 260, 14)
  }
  if (!base || !base.schedule.length) return null

  var repeated = []
  for (var round = 0; round < rounds; round += 1) {
    base.schedule.forEach(function (match) {
      repeated.push({
        a: match.a,
        b: match.b,
        players: match.players,
        key: match.key,
        typeKey: match.typeKey,
        baseCost: match.baseCost,
        index: repeated.length + 1
      })
    })
  }

  return {
    schedule: repeated,
    penalty: schedulePenalty(repeated, players, repeatLimit)
  }
}

function schedulePenalty(schedule, players, repeatLimit) {
  var history = {}
  var partnerUse = {}
  var matchUse = {}
  var matchTypeUse = {}
  var gameCounts = {}
  players.forEach(function (p) { history[p.id] = [] })
  players.forEach(function (p) { gameCounts[p.id] = 0 })

  schedule.forEach(function (match) {
    var playing = {}
    match.players.forEach(function (p) { playing[p.id] = true })
    players.forEach(function (p) {
      history[p.id].push(playing[p.id] ? 'P' : 'R')
      if (playing[p.id]) gameCounts[p.id] += 1
    })
    ;[match.a, match.b].forEach(function (team) {
      var key = pairKey(team[0], team[1])
      partnerUse[key] = (partnerUse[key] || 0) + 1
    })
    matchUse[match.key] = (matchUse[match.key] || 0) + 1
    matchTypeUse[match.typeKey] = (matchTypeUse[match.typeKey] || 0) + 1
  })

  var penalty = 0
  schedule.forEach(function (m) { penalty += m.baseCost })

  Object.keys(history).forEach(function (id) {
    var seq = history[id].join('')
    var pppMatch = seq.match(/PPP+/g)
    if (pppMatch) {
      pppMatch.forEach(function (run) { penalty += run.length * 1000 })
    }
    var rrMatch = seq.match(/RR+/g)
    if (rrMatch) {
      rrMatch.forEach(function (run) { penalty += run.length * 450 })
    }
  })

  Object.keys(partnerUse).forEach(function (key) {
    var count = partnerUse[key]
    if (count > 1) penalty += (count - 1) * 48
  })
  Object.keys(matchUse).forEach(function (key) {
    var count = matchUse[key]
    if (count > repeatLimit) penalty += (count - repeatLimit) * 5000
    else if (count > 1) penalty += (count - 1) * 180
  })
  Object.keys(matchTypeUse).forEach(function (key) {
    var count = matchTypeUse[key]
    penalty += count * count * 8
  })
  var targetGames = getTargetGames(players, schedule.length)
  if (targetGames !== null) {
    Object.keys(gameCounts).forEach(function (id) {
      penalty += Math.pow(gameCounts[id] - targetGames, 2) * 100000
    })
  }

  return penalty
}

function collectWarnings(schedule, players, repeatLimit) {
  var history = {}
  var partnerUse = {}
  var matchUse = {}
  var gameCounts = {}
  players.forEach(function (p) { history[p.id] = [] })
  players.forEach(function (p) { gameCounts[p.id] = 0 })

  schedule.forEach(function (match) {
    var playing = {}
    match.players.forEach(function (p) { playing[p.id] = true })
    players.forEach(function (p) {
      history[p.id].push(playing[p.id] ? 'P' : 'R')
      if (playing[p.id]) gameCounts[p.id] += 1
    })
    ;[match.a, match.b].forEach(function (team) {
      var key = pairKey(team[0], team[1])
      partnerUse[key] = (partnerUse[key] || 0) + 1
    })
    matchUse[match.key] = (matchUse[match.key] || 0) + 1
  })

  var warnings = []
  var hasPPP = false
  var hasRR = false
  Object.keys(history).forEach(function (id) {
    if (history[id].join('').indexOf('PPP') !== -1) hasPPP = true
    if (history[id].join('').indexOf('RR') !== -1) hasRR = true
  })
  if (hasPPP) warnings.push('有人连续打了 3 场')
  if (hasRR) warnings.push('有人连续休息 2 场')

  var hasRepeatPartner = false
  Object.keys(partnerUse).forEach(function (key) {
    if (partnerUse[key] > 1) hasRepeatPartner = true
  })
  if (hasRepeatPartner) warnings.push('部分搭档重复')

  var hasExcess = false
  Object.keys(matchUse).forEach(function (key) {
    if (matchUse[key] > repeatLimit) hasExcess = true
  })
  if (hasExcess) warnings.push('个别完整对阵超过 ' + repeatLimit + ' 次')

  var targetGames = getTargetGames(players, schedule.length)
  if (targetGames !== null) {
    var hasUnevenGames = Object.keys(gameCounts).some(function (id) {
      return gameCounts[id] !== targetGames
    })
    if (hasUnevenGames) warnings.push('有人场次数不均等')
  }

  var maxLevelDiff = 0
  schedule.forEach(function (match) {
    maxLevelDiff = Math.max(maxLevelDiff, matchLevelDiff(match))
  })
  if (maxLevelDiff > 2) warnings.push('个别场次实力差超过 2 级')

  return warnings
}

function tryGenerateQuotaSchedule(players, matchCount, repeatLimit, candidates, targetGames) {
  var best = null

  if (players.length === 7 && matchCount > players.length && matchCount % players.length === 0) {
    best = repeatBaseQuotaSchedule(players, matchCount, repeatLimit, candidates)
  }
  if (best) return best

  best = generateWithQuota(players, matchCount, repeatLimit, candidates, targetGames)
  if (!best) {
    best = generateWithQuota(players, matchCount, repeatLimit, candidates, targetGames, 120, 10)
  }
  if (!best && repeatLimit < 2) {
    best = generateWithQuota(players, matchCount, 2, candidates, targetGames)
    if (!best) best = generateWithQuota(players, matchCount, 2, candidates, targetGames, 120, 10)
  }
  if (!best && repeatLimit < 3) {
    best = generateWithQuota(players, matchCount, 3, candidates, targetGames)
    if (!best) best = generateWithQuota(players, matchCount, 3, candidates, targetGames, 120, 10)
  }
  if (!best) {
    best = generateWithQuota(players, matchCount, Math.max(repeatLimit, 2), candidates, targetGames, 260, 14)
  }
  if (!best) {
    best = repeatBaseQuotaSchedule(players, matchCount, repeatLimit, candidates)
  }

  return best
}

function generate(players, matchCount, repeatLimit) {
  var candidates = enumerateMatches(players)
  if (!candidates.length) {
    return { schedule: [], note: '当前性别组合下没有合法对阵，请调整人员。' }
  }

  var best = null
  var attempts = Math.max(160, Math.min(900, matchCount * 70))
  var targetGames = getTargetGames(players, matchCount)

  if (targetGames !== null) {
    var levelDiffLimits = [1, 1.5, 2]
    for (var limitIndex = 0; limitIndex < levelDiffLimits.length; limitIndex += 1) {
      var limitedCandidates = filterCandidatesByLevelDiff(candidates, levelDiffLimits[limitIndex])
      if (!limitedCandidates.length) continue
      best = tryGenerateQuotaSchedule(players, matchCount, repeatLimit, limitedCandidates, targetGames)
      if (best) break
    }
    if (best) {
      var repeatedWarnings = collectWarnings(best.schedule, players, repeatLimit)
      return {
        schedule: best.schedule,
        note: repeatedWarnings.length
          ? '已生成，并已保证每个人 ' + targetGames + ' 场；但存在无法完全避免的情况：' + repeatedWarnings.join('；') + '。'
          : '已生成一版满足主要限制的赛程，每个人 ' + targetGames + ' 场。'
      }
    }
    return { schedule: [], note: '当前人员和场次数下无法在实力差不超过 2 级的前提下生成均等赛程，请调整人员、等级或场数。' }
  }

  var balancedCandidates = filterCandidatesByLevelDiff(candidates, 2)
  if (balancedCandidates.length) candidates = balancedCandidates

  for (var attempt = 0; attempt < attempts; attempt += 1) {
    var stats = createInitialStats(players)
    var selectedCounts = {}
    var selectedTypeCounts = {}
    var schedule = []

    for (var i = 0; i < matchCount; i += 1) {
      var remainingAfter = matchCount - i - 1
      var ranked = candidates
        .filter(function (match) {
          return isFeasibleByQuota(match, stats, players, remainingAfter, targetGames)
        })
        .map(function (match) {
          return {
            match: match,
            cost: scoreCandidate(match, stats, selectedCounts, selectedTypeCounts, i, matchCount, players.length, repeatLimit, targetGames)
          }
        })
        .sort(function (x, y) { return x.cost - y.cost })

      if (!ranked.length) break

      var pickIndex = Math.min(ranked.length - 1, Math.floor(Math.random() * 3))
      var chosen = ranked[pickIndex].match
      var copy = {
        a: chosen.a,
        b: chosen.b,
        players: chosen.players,
        key: chosen.key,
        typeKey: chosen.typeKey,
        baseCost: chosen.baseCost,
        index: i + 1
      }
      schedule.push(copy)
      selectedCounts[chosen.key] = (selectedCounts[chosen.key] || 0) + 1
      selectedTypeCounts[chosen.typeKey] = (selectedTypeCounts[chosen.typeKey] || 0) + 1
      applyMatchToStats(chosen, stats, players)
    }

    if (schedule.length !== matchCount) continue

    var penalty = schedulePenalty(schedule, players, repeatLimit)
    if (!best || penalty < best.penalty) {
      best = { schedule: schedule, penalty: penalty }
    }
  }

  if (!best) {
    return { schedule: [], note: '当前人员和场次数下无法生成每个人场次数相同的赛程，请调整人员或场数。' }
  }

  var hardWarnings = collectWarnings(best.schedule, players, repeatLimit)
  return {
    schedule: best.schedule,
    note: hardWarnings.length
      ? '已生成，但存在无法完全避免的情况：' + hardWarnings.join('；') + '。'
      : '已生成一版满足主要限制的赛程，可直接开始计分。'
  }
}

function calculateRanking(players, schedule, scores) {
  var rows = players.map(function (p) {
    return {
      id: p.id,
      name: p.name,
      gender: p.gender,
      level: p.level,
      points: 0,
      diff: 0,
      scored: 0,
      games: 0,
      wins: 0,
      losses: 0
    }
  })
  var byId = {}
  rows.forEach(function (r) { byId[r.id] = r })

  schedule.forEach(function (match, index) {
    var score = scores[index]
    if (!score || score.a === '' || score.b === '' || Number(score.a) === Number(score.b)) return
    var aScore = Number(score.a)
    var bScore = Number(score.b)
    var aWin = aScore > bScore

    match.players.forEach(function (p) { byId[p.id].games += 1 })
    match.a.forEach(function (p) {
      byId[p.id].points += aWin ? 2 : 0
      byId[p.id][aWin ? 'wins' : 'losses'] += 1
      byId[p.id].diff += aScore - bScore
      byId[p.id].scored += aScore
    })
    match.b.forEach(function (p) {
      byId[p.id].points += aWin ? 0 : 2
      byId[p.id][aWin ? 'losses' : 'wins'] += 1
      byId[p.id].diff += bScore - aScore
      byId[p.id].scored += bScore
    })
  })

  return rows.sort(function (a, b) {
    return b.points - a.points ||
      b.diff - a.diff ||
      b.scored - a.scored ||
      b.level - a.level ||
      a.name.localeCompare(b.name, 'zh-Hans-CN')
  })
}

module.exports = {
  uid: uid,
  formatLevel: formatLevel,
  genderLabel: genderLabel,
  teamType: teamType,
  teamLevel: teamLevel,
  generate: generate,
  calculateRanking: calculateRanking
}
