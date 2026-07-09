const app = getApp()
const schedule = require('../../utils/schedule')

const GENDER_OPTIONS = ['男', '女']
const GENDER_VALUES = ['M', 'F']
const LEVEL_OPTIONS = [
  '1级', '1.5级', '2级', '2.5级', '3级', '3.5级',
  '4级', '4.5级', '5级', '5.5级', '6级', '6.5级',
  '7级', '7.5级', '8级', '8.5级', '9级'
]
const LEVEL_VALUES = [
  1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9
]
const REPEAT_LIMIT_OPTIONS = ['1次', '2次']
const REPEAT_LIMIT_VALUES = [1, 2]

var lastPlayersHash = ''

function buildMatchCountValues(playerCount) {
  var values = []
  for (var i = 1; i <= 30; i += 1) {
    if (playerCount >= 4 && (i * 4) % playerCount !== 0) continue
    values.push(i)
  }
  return values
}

function nearestMatchCount(values, current) {
  if (values.indexOf(current) !== -1) return current
  var nearest = values[0]
  for (var i = 1; i < values.length; i += 1) {
    if (Math.abs(values[i] - current) < Math.abs(nearest - current)) nearest = values[i]
  }
  return nearest
}

Page({
  data: {
    players: [],
    playerCount: 0,
    nameInput: '',
    genderIndex: 0,
    levelIndex: 4,
    matchCountIndex: 11,
    repeatLimitIndex: 0,
    GENDER_OPTIONS: GENDER_OPTIONS,
    LEVEL_OPTIONS: LEVEL_OPTIONS,
    MATCH_COUNT_OPTIONS: [],
    MATCH_COUNT_VALUES: [],
    REPEAT_LIMIT_OPTIONS: REPEAT_LIMIT_OPTIONS,
    roomCode: '',
    isAdmin: true,
    isGenerating: false,
    joinCodeInput: ''
  },

  onShow() {
    this.refreshList()
    app.globalData._refreshCallbacks[0] = this.refreshList.bind(this)
  },

  onHide() {
    app.globalData._refreshCallbacks[0] = null
  },

  refreshList() {
    var players = app.globalData.players
    var values = buildMatchCountValues(players.length)
    var currentMatchCount = app.globalData.settings.matchCount
    if (values.length && values.indexOf(currentMatchCount) === -1) {
      currentMatchCount = nearestMatchCount(values, currentMatchCount)
      app.globalData.settings.matchCount = currentMatchCount
      app.saveState()
      app.syncRoomSettings()
    }
    var hash = JSON.stringify(players) + app.globalData.roomCode + currentMatchCount
    if (hash === lastPlayersHash) return
    lastPlayersHash = hash

    this.setData({
      players: players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          genderLabel: schedule.genderLabel(p.gender),
          genderClass: p.gender === 'M' ? 'gender-male' : 'gender-female',
          levelLabel: schedule.formatLevel(p.level) + '级'
        }
      }),
      playerCount: players.length,
      MATCH_COUNT_OPTIONS: values.map(function (v) { return v + '场' }),
      MATCH_COUNT_VALUES: values,
      matchCountIndex: Math.max(0, values.indexOf(currentMatchCount)),
      repeatLimitIndex: REPEAT_LIMIT_VALUES.indexOf(app.globalData.settings.repeatLimit),
      roomCode: app.globalData.roomCode || '',
      isAdmin: app.globalData.isAdmin
    })
  },

  // --- Room management ---

  onEnterRoom() {
    if (!app.isCloudAvailable()) {
      wx.showModal({
        title: '提示',
        content: '请先在开发者工具中开通云开发，然后重新编译项目。',
        showCancel: false
      })
      return
    }
    var code = this.data.joinCodeInput.trim()
    if (!code) {
      wx.showToast({ title: '请输入房间号', icon: 'none' })
      return
    }
    wx.showLoading({ title: '进入中...' })
    app.createOrJoinRoom(code, function (ok, info, action) {
      wx.hideLoading()
      if (ok) {
        if (action === 'created') {
          wx.showModal({
            title: '房间已创建',
            content: '房间号：' + info + '\n\n你是管理员，可以管理人员和赛程。',
            showCancel: false
          })
        } else {
          wx.showToast({ title: '已加入房间', icon: 'success' })
        }
      } else {
        wx.showToast({ title: info, icon: 'none' })
      }
    })
  },

  onJoinCodeInput(e) {
    this.setData({ joinCodeInput: e.detail.value })
  },

  onLeaveRoom() {
    var that = this
    wx.showModal({
      title: '离开房间',
      content: '离开后将不再同步房间数据',
      success: function (res) {
        if (res.confirm) {
          app.leaveRoom()
          that.setData({ joinCodeInput: '' })
          wx.showToast({ title: '已离开房间', icon: 'none' })
        }
      }
    })
  },

  onCopyCode() {
    if (this.data.roomCode) {
      wx.setClipboardData({ data: this.data.roomCode })
    }
  },

  // --- Player management ---

  onNameInput(e) {
    this.setData({ nameInput: e.detail.value })
  },

  onGenderChange(e) {
    this.setData({ genderIndex: Number(e.detail.value) })
  },

  onLevelChange(e) {
    this.setData({ levelIndex: Number(e.detail.value) })
  },

  onMatchCountChange(e) {
    if (!this._ensureAdmin()) return
    var idx = Number(e.detail.value)
    var value = this.data.MATCH_COUNT_VALUES[idx]
    if (!value) return
    app.globalData.settings.matchCount = value
    app.saveState()
    app.syncRoomSettings()
    this.setData({ matchCountIndex: idx })
  },

  onRepeatLimitChange(e) {
    if (!this._ensureAdmin()) return
    var idx = Number(e.detail.value)
    app.globalData.settings.repeatLimit = REPEAT_LIMIT_VALUES[idx]
    app.saveState()
    app.syncRoomSettings()
    this.setData({ repeatLimitIndex: idx })
  },

  addPlayer() {
    if (!this._ensureAdmin()) return
    var name = this.data.nameInput.trim()
    var level = LEVEL_VALUES[this.data.levelIndex]
    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }
    if (app.globalData.players.length >= 13) {
      wx.showToast({ title: '最多支持 13 人', icon: 'none' })
      return
    }

    app.globalData.players.push({
      id: schedule.uid(),
      name: name,
      gender: GENDER_VALUES[this.data.genderIndex],
      level: level
    })
    app.globalData.schedule = []
    app.globalData.scores = {}
    app.globalData._scoreTs = {}
    app.saveState()
    app.syncRoomState()
    this.setData({ nameInput: '' })
    this.refreshList()
  },

  removePlayer(e) {
    if (!this._ensureAdmin()) return
    var id = e.currentTarget.dataset.id
    app.globalData.players = app.globalData.players.filter(function (p) { return p.id !== id })
    app.globalData.schedule = []
    app.globalData.scores = {}
    app.globalData._scoreTs = {}
    app.saveState()
    app.syncRoomState()
    this.refreshList()
  },

  loadSample() {
    if (!this._ensureAdmin()) return
    app.globalData.players = [
      { id: schedule.uid(), name: '阿杰', gender: 'M', level: 4 },
      { id: schedule.uid(), name: '小林', gender: 'M', level: 4 },
      { id: schedule.uid(), name: 'Leo', gender: 'M', level: 4 },
      { id: schedule.uid(), name: '安安', gender: 'F', level: 3 },
      { id: schedule.uid(), name: 'Mia', gender: 'F', level: 3 },
      { id: schedule.uid(), name: '小周', gender: 'F', level: 3 }
    ]
    app.globalData.schedule = []
    app.globalData.scores = {}
    app.globalData._scoreTs = {}
    app.saveState()
    app.syncRoomState()
    this.refreshList()
    wx.showToast({ title: '已填入 6 人示例', icon: 'none' })
  },

  generateSchedule() {
    if (!this._ensureAdmin()) return
    if (this.data.isGenerating) return

    var that = this
    this.setData({ isGenerating: true })
    wx.showLoading({ title: '生成中...' })

    setTimeout(function () {
      var result = app.generateSchedule()
      wx.hideLoading()
      that.setData({ isGenerating: false })

      if (!result.success) {
        wx.showToast({ title: result.note, icon: 'none' })
        return
      }
      wx.showToast({ title: '赛程已生成', icon: 'success' })
      setTimeout(function () {
        wx.switchTab({ url: '/pages/schedule/schedule' })
      }, 800)
    }, 50)
  },

  _ensureAdmin() {
    if (!app.globalData.roomCode || app.globalData.isAdmin) return true
    wx.showToast({ title: '仅管理员可以修改', icon: 'none' })
    return false
  }
})
