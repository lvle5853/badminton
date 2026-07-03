const app = getApp()
const schedule = require('../../utils/schedule')

var lastScheduleHash = ''

Page({
  data: {
    matches: [],
    note: ''
  },

  onShow() {
    this.refreshSchedule()
    app.globalData._refreshCallbacks[1] = this.refreshSchedule.bind(this)
  },

  onHide() {
    app.globalData._refreshCallbacks[1] = null
  },

  refreshSchedule() {
    var g = app.globalData
    var scores = g.scores || {}
    var list = g.schedule || []

    var hash = JSON.stringify(list) + JSON.stringify(scores)
    if (hash === lastScheduleHash) return
    lastScheduleHash = hash

    this.setData({
      matches: list.filter(function (m) { return m && m.a && m.b }).map(function (match, index) {
        var score = scores[index] || { a: '', b: '' }
        return {
          index: index,
          num: index + 1,
          typeLabel: schedule.teamType(match.a) + ' vs ' + schedule.teamType(match.b),
          levelLabel: '实力 ' + schedule.formatLevel(schedule.teamLevel(match.a)) + ':' + schedule.formatLevel(schedule.teamLevel(match.b)),
          teamA: match.a.map(function (p) {
            return { name: p.name, level: schedule.genderLabel(p.gender) + schedule.formatLevel(p.level) }
          }),
          teamB: match.b.map(function (p) {
            return { name: p.name, level: schedule.genderLabel(p.gender) + schedule.formatLevel(p.level) }
          }),
          scoreA: score.a,
          scoreB: score.b
        }
      }),
      note: ''
    })
  },

  onScoreInput(e) {
    var index = e.currentTarget.dataset.index
    var side = e.currentTarget.dataset.side
    var value = e.detail.value
    app.updateScore(index, side, value)
  },

  clearScore(e) {
    var index = e.currentTarget.dataset.index
    app.clearScore(index)
    lastScheduleHash = ''
    this.refreshSchedule()
  },

  goToRanking() {
    wx.switchTab({ url: '/pages/ranking/ranking' })
  }
})
