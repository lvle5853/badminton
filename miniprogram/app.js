const schedule = require('./utils/schedule')

var WORKER_BASE = 'https://badmintonforfun.top'
var _pollTimer = null
var _appVisible = true

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
    isAdmin: true,
    localUid: '',
    isTypingScore: false,
    _refreshCallbacks: [],
    _lastWriterId: Date.now() + '' + Math.random()
  },

  onLaunch() {
    this._initLocalUid()
    this.loadState()
  },

  onShow() {
    _appVisible = true
    if (this.globalData.roomCode && !_pollTimer) {
      this._startPolling()
    }
  },

  onHide() {
    _appVisible = false
    if (_pollTimer) {
      clearTimeout(_pollTimer)
      _pollTimer = null
    }
  },

  _initLocalUid() {
    var uid = wx.getStorageSync('badminton-local-uid')
    if (!uid) {
      uid = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8)
      wx.setStorageSync('badminton-local-uid', uid)
    }
    this.globalData.localUid = uid
  },

  // --- Local persistence ---

  loadState() {
    try {
      const raw = wx.getStorageSync('badminton-scheduler-state-v1')
      if (!raw) return
      const data = JSON.parse(raw)
      const g = this.globalData
      g.players = Array.isArray(data.players) ? data.players : []
      g.schedule = Array.isArray(data.schedule) ? data.schedule : []
      g.scores = data.scores && typeof data.scores === 'object' ? data.scores : {}
      if (data.settings) {
        if (data.settings.matchCount) g.settings.matchCount = data.settings.matchCount
        if (data.settings.repeatLimit) g.settings.repeatLimit = data.settings.repeatLimit
      }
      if (data.roomCode) g.roomCode = data.roomCode
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
        settings: g.settings,
        roomCode: g.roomCode,
        isAdmin: g.isAdmin
      }))
    } catch (e) {
      console.warn('保存本地数据失败', e)
    }
  },

  // --- Room management ---

  isCloudAvailable() {
    return true
  },

  _apiRequest(method, path, data, callback) {
    wx.request({
      url: WORKER_BASE + path,
      method: method,
      data: data || undefined,
      header: { 'Content-Type': 'application/json' },
      timeout: 10000,
      success: function (res) {
        callback && callback(res.statusCode, res.data)
      },
      fail: function (err) {
        console.warn('API请求失败', method, path, err)
        callback && callback(0, null)
      }
    })
  },

  createRoom(callback) {
    var g = this.globalData
    var that = this
    var attempts = 0

    function tryCreate() {
      if (++attempts > 10) {
        callback(false, '创建失败，请重试')
        return
      }

      var code = String(Math.floor(1000 + Math.random() * 9000))

      that._apiRequest('POST', '/api/room', {
        roomCode: code,
        adminId: g.localUid,
        players: g.players,
        schedule: g.schedule,
        scores: g.scores,
        settings: g.settings,
        _lastWriterId: g._lastWriterId
      }, function (status, data) {
        if (status === 409) {
          tryCreate()
          return
        }
        if (status === 201) {
          g.roomCode = code
          g.isAdmin = true
          that.saveState()
          that._startPolling()
          callback(true, code)
        } else {
          callback(false, '创建失败，请重试')
        }
      })
    }

    tryCreate()
  },

  createOrJoinRoom(code, callback) {
    var that = this
    var g = this.globalData
    this._apiRequest('GET', '/api/room?code=' + code, null, function (status, data) {
      if (status === 200 && data) {
        g.roomCode = data.roomCode
        g.isAdmin = data.adminId ? data.adminId === g.localUid : true
        that._applyRoomData(data)
        that.saveState()
        that._startPolling()
        callback(true, data.roomCode, 'joined')
        return
      }
      that._apiRequest('POST', '/api/room', {
        roomCode: code,
        adminId: g.localUid,
        players: g.players,
        schedule: g.schedule,
        scores: g.scores,
        settings: g.settings,
        _lastWriterId: g._lastWriterId
      }, function (status2, data2) {
        if (status2 === 201) {
          g.roomCode = code
          g.isAdmin = true
          that.saveState()
          that._startPolling()
          callback(true, code, 'created')
        } else {
          callback(false, '进入房间失败，请重试')
        }
      })
    })
  },

  joinRoom(code, callback) {
    var that = this
    var g = this.globalData

    this._apiRequest('GET', '/api/room?code=' + code, null, function (status, data) {
      if (status !== 200 || !data) {
        callback(false, status === 404 ? '房间不存在' : '加入失败，请重试')
        return
      }
      g.roomCode = data.roomCode
      g.isAdmin = data.adminId ? data.adminId === g.localUid : true
      that._applyRoomData(data)
      that.saveState()
      that._startPolling()
      callback(true, data.roomCode)
    })
  },

  _startPolling() {
    if (_pollTimer) {
      clearTimeout(_pollTimer)
      _pollTimer = null
    }
    var g = this.globalData
    if (!g.roomCode) return

    var that = this
    function poll() {
      if (!g.roomCode || !_appVisible) {
        _pollTimer = null
        return
      }
      that._apiRequest('GET', '/api/room?code=' + g.roomCode, null, function (status, data) {
        if (status === 200 && data) {
          that._applyRoomData(data)
        }
        _pollTimer = setTimeout(poll, 1000)
      })
    }
    poll()
  },

  // 写操作后立刻拉取最新数据（比轮询更快感知变化）
  _refreshNow() {
    var g = this.globalData
    if (!g.roomCode) return
    var that = this
    this._apiRequest('GET', '/api/room?code=' + g.roomCode, null, function (status, data) {
      if (status === 200 && data) {
        that._applyRoomData(data)
      }
    })
  },

  _applyRoomData(room) {
    const g = this.globalData
    if (Array.isArray(room.players)) g.players = room.players
    if (Array.isArray(room.schedule)) g.schedule = room.schedule
    if (room.settings) {
      if (room.settings.matchCount) g.settings.matchCount = room.settings.matchCount
      if (room.settings.repeatLimit) g.settings.repeatLimit = room.settings.repeatLimit
    }
    if (room.adminId) {
      g.isAdmin = room.adminId === g.localUid
    }
    // scores：带时间戳对比，旧数据不覆盖本地新数据
    if (room.scores && typeof room.scores === 'object') {
      if (!g._scoreTs) g._scoreTs = {}
      var merged = {}
      for (var key in room.scores) {
        if (key.endsWith('_ts')) continue
        var serverTs = room.scores[key + '_ts'] || {}
        var localTs = g._scoreTs[key] || {}
        var serverScore = room.scores[key]
        var localScore = g.scores[key]
        if (typeof serverScore === 'object' && serverScore !== null) {
          merged[key] = {}
          for (var field in serverScore) {
            if ((serverTs[field] || 0) >= (localTs[field] || 0)) {
              merged[key][field] = serverScore[field]
            } else {
              merged[key][field] = localScore ? (localScore[field] || '') : ''
            }
          }
          // 更新时间戳
          for (var field in serverTs) {
            if ((serverTs[field] || 0) >= (localTs[field] || 0)) {
              localTs[field] = serverTs[field]
            }
          }
          g._scoreTs[key] = localTs
        } else {
          merged[key] = serverScore
        }
      }
      g.scores = merged
    }
    this.saveState()
    this.notifyPages()
  },

  leaveRoom() {
    if (_pollTimer) {
      clearTimeout(_pollTimer)
      _pollTimer = null
    }
    this.globalData.roomCode = ''
    this.globalData.isAdmin = true
    this.saveState()
    this.notifyPages()
  },

  notifyPages() {
    const cbs = this.globalData._refreshCallbacks
    for (let i = 0; i < cbs.length; i++) {
      if (typeof cbs[i] === 'function') cbs[i]()
    }
  },

  syncRoomSettings() {
    var g = this.globalData
    if (!g.roomCode) return
    var that = this
    this._apiRequest('PUT', '/api/room?code=' + g.roomCode, { settings: g.settings }, function () {
      that._refreshNow()
    })
  },

  syncRoomState() {
    var g = this.globalData
    if (!g.roomCode) return
    var that = this
    this._apiRequest('PUT', '/api/room?code=' + g.roomCode, {
      players: g.players,
      schedule: g.schedule,
      scores: g.scores,
      settings: g.settings
    }, function () {
      that._refreshNow()
    })
  },

  // --- Schedule operations ---

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
    g.schedule = result.schedule
    g.scores = {}
    this.saveState()

    if (g.roomCode) {
      var that = this
      this._apiRequest('PUT', '/api/room?code=' + g.roomCode, {
        schedule: g.schedule,
        scores: g.scores,
        settings: g.settings
      }, function () {
        that._refreshNow()
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

    if (g.roomCode) {
      var updateData = {}
      updateData['scores.' + matchIndex + '.' + side] = value
      updateData['scores.' + matchIndex + '_ts'] = g._scoreTs[matchIndex]
      this._apiRequest('PUT', '/api/room?code=' + g.roomCode, updateData)
    }

    var that = this
    if (this._debouncedSyncScore) {
      clearTimeout(this._debouncedSyncScore)
    }
    this._debouncedSyncScore = setTimeout(function () {
      that._debouncedSyncScore = null
      if (g.roomCode) {
        var payload = { scores: g.scores, _lastWriterId: g._lastWriterId }
        if (g._scoreTs) {
          for (var idx in g._scoreTs) {
            payload['scores.' + idx + '_ts'] = g._scoreTs[idx]
          }
        }
        that._apiRequest('PUT', '/api/room?code=' + g.roomCode, payload, function () {
          that._refreshNow()
        })
      }
    }, 200)
  },

  clearScore(matchIndex) {
    var g = this.globalData
    if (this._debouncedSyncScore) {
      clearTimeout(this._debouncedSyncScore)
      this._debouncedSyncScore = null
    }

    delete g.scores[matchIndex]
    this.saveState()

    if (g.roomCode) {
      var that = this
      var updateData = { _lastWriterId: g._lastWriterId }
      updateData['scores.' + matchIndex] = null
      this._apiRequest('PUT', '/api/room?code=' + g.roomCode, updateData, function () {
        that._refreshNow()
      })
    }
  },

  calculateRanking() {
    const g = this.globalData
    return schedule.calculateRanking(g.players, g.schedule, g.scores)
  }
})
