const app = getApp()
const schedule = require('../../utils/schedule')

var lastRankingHash = ''

Page({
  data: {
    rows: []
  },

  onShow() {
    this.refreshRanking()
    app.globalData._refreshCallbacks[2] = this.refreshRanking.bind(this)
  },

  onHide() {
    app.globalData._refreshCallbacks[2] = null
  },

  refreshRanking() {
    var hash = JSON.stringify(app.globalData.players) + JSON.stringify(app.globalData.schedule) + JSON.stringify(app.globalData.scores)
    if (hash === lastRankingHash) return
    lastRankingHash = hash

    var scheduledGames = {}
    app.globalData.players.forEach(function (player) {
      scheduledGames[player.id] = 0
    })
    app.globalData.schedule.forEach(function (match) {
      if (!match || !Array.isArray(match.players)) return
      match.players.forEach(function (player) {
        if (scheduledGames[player.id] !== undefined) scheduledGames[player.id] += 1
      })
    })

    var rows = app.calculateRanking()
    this.setData({
      rows: rows.map(function (row, i) {
        return {
          rank: i + 1,
          name: row.name,
          gender: schedule.genderLabel(row.gender),
          genderClass: row.gender === 'M' ? 'gender-male' : 'gender-female',
          level: schedule.formatLevel(row.level) + '级',
          points: row.points,
          winLoss: row.wins + '胜' + row.losses + '负',
          diff: (row.diff > 0 ? '+' : '') + row.diff,
          scored: row.scored,
          games: row.games,
          scheduledGames: scheduledGames[row.id] || 0,
          gameText: row.games + '/' + (scheduledGames[row.id] || 0)
        }
      })
    })
  }
})
