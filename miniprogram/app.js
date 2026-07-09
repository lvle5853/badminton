const schedule = require('./utils/schedule')

var db = null
var roomWatcher = null

App({
  globalData: {
    players: [],
    schedule: [],
    scores: {},
    settings: {
      matchCount: 12,
      repeatLimit: 1
    },
    roomCode: '',
    roomDocId: '',
    isAdmin: true,
    localUid: '',
    _scoreTs: {},
    _scoreSyncTimers: {},
    _refreshCallbacks: []
  },

  onLaunch() {
    this._initLocalUid()
    if (wx.cloud) {
      wx.cloud.init({
        traceUser: true,
        timeout: 10000
      })
      db = wx.cloud.database()
    } else {
      console.warn('当前环境不支持 wx.cloud')
    }
    this.loadState()
  },

  onShow() {
    if (this.globalData.roomCode && !roomWatcher) {
      this._setupRoomListener()
    }
  },

  onHide() {},

  _initLocalUid() {
    var uid = wx.getStorageSync('badminton-local-uid')
    if (!uid) {
      uid = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8)
      wx.setStorageSync('badminton-local-uid', uid)
    }
    this.globalData.localUid = uid
  },

  loadState() {
    try {
      const raw = wx.getStorageSync('badminton-scheduler-state-v1')
      if (!raw) return
      const data = JSON.parse(raw)
      const g = this.globalData
      g.players = Array.isArray(data.players) ? data.players : []
      g.schedule = Array.isArray(data.schedule) ? data.schedule : []
      g.scores = data.scores && typeof data.scores === 'object' ? data.scores : {}
      g._scoreTs = data._scoreTs && typeof data._scoreTs === 'object' ? data._scoreTs : {}
      if (data.settings) {
        if (data.settings.matchCount) g.settings.matchCount = data.settings.matchCount
        if (data.settings.repeatLimit) g.settings.repeatLimit = data.settings.repeatLimit
      }
      if (data.roomCode) g.roomCode = data.roomCode
      if (data.roomDocId) g.roomDocId = data.roomDocId
      if (typeof data.isAdmin === 'boolean') g.isAdmin = data.isAdmin
    } catch (e) {
      console.warn('读取本地数据失败', e)
    }
  },

  saveState() {
    try {
      const g = this.globalData
      wx.setStorageSync('badminton-scheduler-state-v1', JSON.stringify({
        players: g.players,
        schedule: g.schedule,
        scores: g.scores,
        _scoreTs: g._scoreTs,
        settings: g.settings,
        roomCode: g.roomCode,
        roomDocId: g.roomDocId,
        isAdmin: g.isAdmin
      }))
    } catch (e) {
      console.warn('保存本地数据失败', e)
    }
  },

  isCloudAvailable() {
    return !!db
  },

  _findRoom(code, callback) {
    if (!db) {
      callback(false, null)
      return
    }
    db.collection('rooms').where({ roomCode: code }).get({
      success: function (res) {
        callback(true, res.data && res.data.length ? res.data[0] : null)
      },
      fail: function () {
        callback(false, null)
      }
    })
  },

  createOrJoinRoom(code, callback) {
    var that = this
    var g = this.globalData
    if (!db) {
      callback(false, '云开发未初始化，请检查配置')
      return
    }

    this._findRoom(code, function (ok, room) {
      if (!ok) {
        callback(false, '进入房间失败，请重试')
        return
      }

      if (room) {
        g.roomCode = room.roomCode
        g.roomDocId = room._id || ''
        g.isAdmin = room.adminId ? room.adminId === g.localUid : true
        that._applyRoomData(room)
        that.saveState()
        that._setupRoomListener()
        callback(true, room.roomCode, 'joined')
        return
      }

      g.scores = {}
      g._scoreTs = {}
      db.collection('rooms').add({
        data: {
          roomCode: code,
          adminId: g.localUid,
          players: g.players,
          schedule: g.schedule,
          scores: {},
          settings: g.settings,
          createdAt: new Date()
        },
        success: function (res) {
          g.roomCode = code
          g.roomDocId = res._id || ''
          g.isAdmin = true
          that.saveState()
          that._setupRoomListener()
          callback(true, code, 'created')
        },
        fail: function () {
          callback(false, '进入房间失败，请重试')
        }
      })
    })
  },

  joinRoom(code, callback) {
    if (!db) {
      callback(false, '云开发未初始化，请检查配置')
      return
    }

    var that = this
    var g = this.globalData
    this._findRoom(code, function (ok, room) {
      if (!ok) {
        callback(false, '加入失败，请重试')
        return
      }
      if (!room) {
        callback(false, '房间不存在')
        return
      }

      g.roomCode = room.roomCode
      g.roomDocId = room._id || ''
      g.isAdmin = room.adminId ? room.adminId === g.localUid : true
      that._applyRoomData(room)
      that.saveState()
      that._setupRoomListener()
      callback(true, room.roomCode)
    })
  },

  _setupRoomListener() {
    if (roomWatcher) {
      roomWatcher.close()
      roomWatcher = null
    }
    if (!db || !this.globalData.roomCode) return

    var that = this
    roomWatcher = db.collection('rooms')
      .where({ roomCode: this.globalData.roomCode })
      .watch({
        onChange: function (snapshot) {
          if (snapshot.docs && snapshot.docs.length > 0) {
            that._applyRoomData(snapshot.docs[0])
          }
        },
        onError: function (err) {
          console.warn('实时同步失败', err)
        }
      })
  },

  _applyRoomData(room) {
    const g = this.globalData
    if (Array.isArray(room.players)) g.players = room.players
    if (Array.isArray(room.schedule)) g.schedule = room.schedule
    if (room._id) g.roomDocId = room._id
    if (room.settings) {
      if (room.settings.matchCount) g.settings.matchCount = room.settings.matchCount
      if (room.settings.repeatLimit) g.settings.repeatLimit = room.settings.repeatLimit
    }
    if (room.adminId) {
      g.isAdmin = room.adminId === g.localUid
    }
    if (!g._scoreTs) g._scoreTs = {}
    if (room.scores && typeof room.scores === 'object') {
      var mergedScores = {}
      for (var key in room.scores) {
        var serverScore = room.scores[key]
        if (!serverScore || typeof serverScore !== 'object') {
          mergedScores[key] = serverScore
          continue
        }

        mergedScores[key] = {}
        var serverTs = serverScore._ts || {}
        var localTs = g._scoreTs[key] || {}
        var localScore = g.scores[key] || {}
        ;['a', 'b'].forEach(function (side) {
          var remoteTime = serverTs[side] || 0
          var localTime = localTs[side] || 0
          if (remoteTime >= localTime) {
            mergedScores[key][side] = serverScore[side] || ''
            if (remoteTime) localTs[side] = remoteTime
          } else {
            mergedScores[key][side] = localScore[side] || ''
          }
        })
        if (localTs.a || localTs.b) g._scoreTs[key] = localTs
      }
      g.scores = mergedScores
    } else if (!Object.keys(g._scoreTs).length) {
      g.scores = {}
    }
    this.saveState()
    this.notifyPages()
  },

  leaveRoom() {
    if (roomWatcher) {
      roomWatcher.close()
      roomWatcher = null
    }
    this.globalData.roomCode = ''
    this.globalData.roomDocId = ''
    this.globalData.isAdmin = true
    this.globalData.scores = {}
    this.globalData._scoreTs = {}
    this.saveState()
    this.notifyPages()
  },

  notifyPages() {
    const cbs = this.globalData._refreshCallbacks
    for (let i = 0; i < cbs.length; i++) {
      if (typeof cbs[i] === 'function') cbs[i]()
    }
  },

  _updateCurrentRoom(data, callback) {
    var g = this.globalData
    if (!db || !g.roomCode) {
      callback && callback(false)
      return
    }
    if (g.roomDocId) {
      db.collection('rooms').doc(g.roomDocId).update({
        data: data,
        success: function () {
          callback && callback(true)
        },
        fail: function () {
          g.roomDocId = ''
          callback && callback(false)
        }
      })
      return
    }
    this._findRoom(g.roomCode, function (ok, room) {
      if (!ok || !room || !room._id) {
        callback && callback(false)
        return
      }
      g.roomDocId = room._id
      db.collection('rooms').doc(room._id).update({
        data: data,
        success: function () {
          callback && callback(true)
        },
        fail: function () {
          callback && callback(false)
        }
      })
    })
  },

  syncRoomSettings() {
    var g = this.globalData
    if (!g.roomCode || !g.isAdmin) return
    this._updateCurrentRoom({ settings: g.settings })
  },

  syncRoomState() {
    var g = this.globalData
    if (!g.roomCode || !g.isAdmin) return
    this._updateCurrentRoom({
      players: g.players,
      schedule: g.schedule,
      scores: g.scores,
      settings: g.settings
    })
  },

  generateSchedule() {
    const g = this.globalData
    if (g.roomCode && !g.isAdmin) {
      return { success: false, note: '仅管理员可以生成赛程' }
    }
    const count = g.players.length
    if (count < 4 || count > 13) {
      return { success: false, note: '请先录入 4-13 名参赛人员。' }
    }
    if ((g.settings.matchCount * 4) % count !== 0) {
      return { success: false, note: '当前场次数无法保证每个人上场次数相同，请重新选择比赛场数。' }
    }
    const result = schedule.generate(g.players, g.settings.matchCount, g.settings.repeatLimit)
    if (!result.schedule.length) {
      return { success: false, note: result.note }
    }

    if (g._scoreSyncTimers) {
      for (var timerKey in g._scoreSyncTimers) {
        clearTimeout(g._scoreSyncTimers[timerKey])
        delete g._scoreSyncTimers[timerKey]
      }
    }
    g.schedule = result.schedule
    g.scores = {}
    g._scoreTs = {}
    this.saveState()

    if (g.roomCode && db) {
      var _ = db.command
      this._updateCurrentRoom({
        schedule: g.schedule,
        scores: _.set({}),
        settings: g.settings
      })
    }

    return { success: true, note: result.note }
  },

  updateScore(matchIndex, side, value) {
    var g = this.globalData
    if (!g.scores[matchIndex]) {
      g.scores[matchIndex] = { a: '', b: '' }
    }
    g.scores[matchIndex][side] = value
    var now = Date.now()
    if (!g._scoreTs) g._scoreTs = {}
    if (!g._scoreTs[matchIndex]) g._scoreTs[matchIndex] = {}
    g._scoreTs[matchIndex][side] = now
    this.saveState()

    if (g.roomCode && db) {
      var that = this
      var timerKey = matchIndex + ':' + side
      if (!g._scoreSyncTimers) g._scoreSyncTimers = {}
      if (g._scoreSyncTimers[timerKey]) {
        clearTimeout(g._scoreSyncTimers[timerKey])
      }
      g._scoreSyncTimers[timerKey] = setTimeout(function () {
        delete g._scoreSyncTimers[timerKey]
        var latestValue = g.scores[matchIndex] ? g.scores[matchIndex][side] : ''
        var latestTs = g._scoreTs && g._scoreTs[matchIndex] ? g._scoreTs[matchIndex][side] : now
        var data = {}
        data['scores.' + matchIndex + '.' + side] = latestValue
        data['scores.' + matchIndex + '._ts.' + side] = latestTs
        that._updateCurrentRoom(data, function () {
          that.notifyPages()
        })
      }, 300)
    } else {
      this.notifyPages()
    }
  },

  flushScoreSync() {
    var g = this.globalData
    if (!g._scoreSyncTimers) return
    for (var key in g._scoreSyncTimers) {
      clearTimeout(g._scoreSyncTimers[key])
      delete g._scoreSyncTimers[key]
    }
    if (!g.roomCode || !db) {
      this.notifyPages()
      return
    }
    var data = {}
    for (var idx in g._scoreTs) {
      if (!g.scores[idx]) continue
      ;['a', 'b'].forEach(function (side) {
        if (!g._scoreTs[idx][side]) return
        data['scores.' + idx + '.' + side] = g.scores[idx][side] || ''
        data['scores.' + idx + '._ts.' + side] = g._scoreTs[idx][side]
      })
    }
    this._updateCurrentRoom(data, this.notifyPages.bind(this))
  },

  updateScoreImmediate(matchIndex, side, value) {
    var g = this.globalData
    if (!g.scores[matchIndex]) {
      g.scores[matchIndex] = { a: '', b: '' }
    }
    g.scores[matchIndex][side] = value
    var now = Date.now()
    if (!g._scoreTs) g._scoreTs = {}
    if (!g._scoreTs[matchIndex]) g._scoreTs[matchIndex] = {}
    g._scoreTs[matchIndex][side] = now
    this.saveState()

    if (g.roomCode && db) {
      var data = {}
      data['scores.' + matchIndex + '.' + side] = value
      data['scores.' + matchIndex + '._ts.' + side] = now
      this._updateCurrentRoom(data, this.notifyPages.bind(this))
    } else {
      this.notifyPages()
    }
  },

  clearScore(matchIndex) {
    var g = this.globalData
    if (g._scoreSyncTimers) {
      ;['a', 'b'].forEach(function (side) {
        var timerKey = matchIndex + ':' + side
        if (g._scoreSyncTimers[timerKey]) {
          clearTimeout(g._scoreSyncTimers[timerKey])
          delete g._scoreSyncTimers[timerKey]
        }
      })
    }
    delete g.scores[matchIndex]
    if (g._scoreTs) delete g._scoreTs[matchIndex]
    this.saveState()
    this.notifyPages()

    if (g.roomCode && db) {
      var _ = db.command
      var data = {}
      data['scores.' + matchIndex] = _.remove()
      this._updateCurrentRoom(data)
    }
  },

  calculateRanking() {
    const g = this.globalData
    return schedule.calculateRanking(g.players, g.schedule, g.scores)
  }
})
