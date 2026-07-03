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
    var hash = JSON.stringify(app.globalData.players) + JSON.stringify(app.globalData.scores)
    if (hash === lastRankingHash) return
    lastRankingHash = hash

    var rows = app.calculateRanking()
    this.setData({
      rows: rows.map(function (row, i) {
        return {
          rank: i + 1,
          name: row.name,
          gender: schedule.genderLabel(row.gender),
          level: schedule.formatLevel(row.level) + '级',
          points: row.points,
          winLoss: row.wins + '胜' + row.losses + '负',
          diff: (row.diff > 0 ? '+' : '') + row.diff,
          scored: row.scored,
          games: row.games
        }
      })
    })
  }
})
