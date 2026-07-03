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
const MATCH_COUNT_OPTIONS = []
for (var i = 1; i <= 30; i++) MATCH_COUNT_OPTIONS.push(i + '场')
const REPEAT_LIMIT_OPTIONS = ['1次', '2次']
const REPEAT_LIMIT_VALUES = [1, 2]

var lastPlayersHash = ''

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
    MATCH_COUNT_OPTIONS: MATCH_COUNT_OPTIONS,
    REPEAT_LIMIT_OPTIONS: REPEAT_LIMIT_OPTIONS,
    roomCode: '',
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
    var hash = JSON.stringify(players) + app.globalData.roomCode
    if (hash === lastPlayersHash) return
    lastPlayersHash = hash

    this.setData({
      players: players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          genderLabel: schedule.genderLabel(p.gender),
          levelLabel: schedule.formatLevel(p.level) + '级'
        }
      }),
      playerCount: players.length,
      matchCountIndex: app.globalData.settings.matchCount - 1,
      repeatLimitIndex: REPEAT_LIMIT_VALUES.indexOf(app.globalData.settings.repeatLimit),
      roomCode: app.globalData.roomCode || ''
    })
  },

  // --- Room management ---

  onCreateRoom() {
    if (!app.isCloudAvailable()) {
      wx.showModal({
        title: '提示',
        content: '请先在开发者工具中开通云开发，然后重新编译项目。',
        showCancel: false
      })
      return
    }
    wx.showLoading({ title: '创建中...' })
    app.createRoom(function (ok, info) {
      wx.hideLoading()
      if (ok) {
        wx.showModal({
          title: '房间已创建',
          content: '房间号：' + info + '\n\n分享给朋友，输入房间号即可加入',
          showCancel: false
        })
      } else {
        wx.showToast({ title: info, icon: 'none' })
      }
    })
  },

  onJoinRoom() {
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
    wx.showLoading({ title: '加入中...' })
    app.joinRoom(code, function (ok, info) {
      wx.hideLoading()
      if (ok) {
        wx.showToast({ title: '已加入房间', icon: 'success' })
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
    var idx = Number(e.detail.value)
    app.globalData.settings.matchCount = idx + 1
    app.saveState()
    this.setData({ matchCountIndex: idx })
  },

  onRepeatLimitChange(e) {
    var idx = Number(e.detail.value)
    app.globalData.settings.repeatLimit = REPEAT_LIMIT_VALUES[idx]
    app.saveState()
    this.setData({ repeatLimitIndex: idx })
  },

  addPlayer() {
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
    app.saveState()
    this.setData({ nameInput: '' })
    this.refreshList()
  },

  removePlayer(e) {
    var id = e.currentTarget.dataset.id
    app.globalData.players = app.globalData.players.filter(function (p) { return p.id !== id })
    app.globalData.schedule = []
    app.globalData.scores = {}
    app.saveState()
    this.refreshList()
  },

  loadSample() {
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
    app.saveState()
    this.refreshList()
    wx.showToast({ title: '已填入 6 人示例', icon: 'none' })
  },

  generateSchedule() {
    var result = app.generateSchedule()
    if (!result.success) {
      wx.showToast({ title: result.note, icon: 'none' })
      return
    }
    wx.showToast({ title: '赛程已生成', icon: 'success' })
    setTimeout(function () {
      wx.switchTab({ url: '/pages/schedule/schedule' })
    }, 800)
  }
})
