const app = getApp()
const schedule = require('../../utils/schedule')

var lastScheduleHash = ''
var selectedPlayerIds = []

function playerView(player) {
  return {
    id: player.id,
    name: player.name,
    level: schedule.genderLabel(player.gender) + schedule.formatLevel(player.level),
    genderClass: player.gender === 'M' ? 'gender-male' : 'gender-female'
  }
}

Page({
  data: {
    matches: [],
    selectedFilters: [],
    note: '',
    hasFilter: false,
    emptyText: '添加人员后生成赛程'
  },

  onShow() {
    this.refreshSchedule()
    app.globalData._refreshCallbacks[1] = this.refreshSchedule.bind(this)
  },

  onHide() {
    app.flushScoreSync()
    app.globalData._refreshCallbacks[1] = null
  },

  refreshSchedule() {
    var g = app.globalData
    var scores = g.scores || {}
    var list = g.schedule || []
    var currentPlayerIds = {}
    g.players.forEach(function (player) {
      currentPlayerIds[player.id] = true
    })
    selectedPlayerIds = selectedPlayerIds.filter(function (id) {
      return !!currentPlayerIds[id]
    })
    var selectedMap = {}
    selectedPlayerIds.forEach(function (id) { selectedMap[id] = true })

    var hash = JSON.stringify(g.players) + JSON.stringify(list) + JSON.stringify(scores) + selectedPlayerIds.join(',')
    if (hash === lastScheduleHash) return
    lastScheduleHash = hash

    var hasFilter = selectedPlayerIds.length > 0
    var selectedFilters = g.players
      .filter(function (player) {
        return !!selectedMap[player.id]
      })
      .map(function (player) {
        return playerView(player)
      })
    var visibleList = list.filter(function (m) {
      if (!m || !m.a || !m.b) return false
      if (!hasFilter) return true
      return selectedPlayerIds.every(function (id) {
        return m.players.some(function (player) {
          return player.id === id
        })
      })
    })

    this.setData({
      matches: visibleList.map(function (match) {
        var index = list.indexOf(match)
        var score = scores[index] || { a: '', b: '' }
        return {
          index: index,
          num: index + 1,
          typeLabel: schedule.teamType(match.a) + ' vs ' + schedule.teamType(match.b),
          levelLabel: '实力 ' + schedule.formatLevel(schedule.teamLevel(match.a)) + ':' + schedule.formatLevel(schedule.teamLevel(match.b)),
          teamA: match.a.map(function (p) {
            var view = playerView(p)
            view.selected = !!selectedMap[p.id]
            return view
          }),
          teamB: match.b.map(function (p) {
            var view = playerView(p)
            view.selected = !!selectedMap[p.id]
            return view
          }),
          scoreA: score.a,
          scoreB: score.b
        }
      }),
      selectedFilters: selectedFilters,
      hasFilter: hasFilter,
      emptyText: hasFilter ? '没有同时包含所选人员的比赛' : '添加人员后生成赛程',
      note: hasFilter && visibleList.length === 0 ? '没有同时包含所选人员的比赛。' : ''
    })
  },

  togglePlayerFilter(e) {
    var id = e.currentTarget.dataset.id
    var index = selectedPlayerIds.indexOf(id)
    if (index === -1) {
      selectedPlayerIds.push(id)
    } else {
      selectedPlayerIds.splice(index, 1)
    }
    lastScheduleHash = ''
    this.refreshSchedule()
  },

  clearPlayerFilter() {
    selectedPlayerIds = []
    lastScheduleHash = ''
    this.refreshSchedule()
  },

  onScoreInput(e) {
    var index = e.currentTarget.dataset.index
    var side = e.currentTarget.dataset.side
    var value = e.detail.value
    app.updateScore(index, side, value)
  },

  onScoreBlur(e) {
    var index = e.currentTarget.dataset.index
    var side = e.currentTarget.dataset.side
    var value = e.detail.value
    app.updateScoreImmediate(index, side, value)
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
