const schedule = require('./utils/schedule')

let db = null
let roomWatcher = null

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
    _refreshCallbacks: []
  },

  onLaunch() {
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
        roomCode: g.roomCode
      }))
    } catch (e) {
      console.warn('保存本地数据失败', e)
    }
  },

  // --- Room management ---

  isCloudAvailable() {
    return !!db
  },

  createRoom(callback) {
    if (!db) {
      callback(false, '云开发未初始化，请检查配置')
      return
    }

    const g = this.globalData
    const that = this
    let attempts = 0

    function tryCreate() {
      if (++attempts > 10) {
        callback(false, '创建失败，请重试')
        return
      }

      const code = String(Math.floor(1000 + Math.random() * 9000))

      db.collection('rooms').where({ roomCode: code }).get({
        success: (res) => {
          if (res.data && res.data.length) {
            tryCreate()
            return
          }
          db.collection('rooms').add({
            data: {
              roomCode: code,
              players: g.players,
              schedule: g.schedule,
              scores: g.scores,
              settings: g.settings,
              createdAt: new Date()
            },
            success: () => {
              g.roomCode = code
              that.saveState()
              that._setupRoomListener()
              callback(true, code)
            },
            fail: () => {
              callback(false, '创建失败，请重试')
            }
          })
        },
        fail: () => {
          tryCreate()
        }
      })
    }

    tryCreate()
  },

  joinRoom(code, callback) {
    if (!db) {
      callback(false, '云开发未初始化，请检查配置')
      return
    }

    const g = this.globalData

    db.collection('rooms').where({ roomCode: code }).get({
      success: (res) => {
        if (!res.data || !res.data.length) {
          callback(false, '房间不存在')
          return
        }
        const room = res.data[0]
        g.roomCode = room.roomCode
        this._applyRoomData(room)
        this.saveState()
        this._setupRoomListener()
        callback(true, room.roomCode)
      },
      fail: () => {
        callback(false, '加入失败，请重试')
      }
    })
  },

  _setupRoomListener() {
    if (roomWatcher) {
      roomWatcher.close()
      roomWatcher = null
    }
    if (!db || !this.globalData.roomCode) return

    const g = this.globalData

    roomWatcher = db.collection('rooms')
      .where({ roomCode: g.roomCode })
      .watch({
        onChange: (snapshot) => {
          if (snapshot.docs && snapshot.docs.length > 0) {
            this._applyRoomData(snapshot.docs[0])
          }
        },
        onError: (err) => {
          console.warn('实时同步失败', err)
        }
      })
  },

  _applyRoomData(room) {
    const g = this.globalData
    if (Array.isArray(room.players)) g.players = room.players
    if (Array.isArray(room.schedule)) g.schedule = room.schedule
    if (room.scores && typeof room.scores === 'object') g.scores = room.scores
    if (room.settings) {
      if (room.settings.matchCount) g.settings.matchCount = room.settings.matchCount
      if (room.settings.repeatLimit) g.settings.repeatLimit = room.settings.repeatLimit
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
    this.saveState()
    this.notifyPages()
  },

  notifyPages() {
    const cbs = this.globalData._refreshCallbacks
    for (let i = 0; i < cbs.length; i++) {
      if (typeof cbs[i] === 'function') cbs[i]()
    }
  },

  // --- Schedule operations ---

  generateSchedule() {
    const g = this.globalData
    const count = g.players.length
    if (count < 4 || count > 13) {
      return { success: false, note: '请先录入 4-13 名参赛人员。' }
    }
    const result = schedule.generate(g.players, g.settings.matchCount, g.settings.repeatLimit)
    g.schedule = result.schedule
    g.scores = {}
    this.saveState()

    if (g.roomCode && db) {
      db.collection('rooms').where({ roomCode: g.roomCode }).get({
        success: (res) => {
          if (res.data && res.data.length) {
            db.collection('rooms').doc(res.data[0]._id).update({
              data: { schedule: g.schedule, scores: g.scores }
            })
          }
        }
      })
    }

    return { success: true, note: result.note }
  },

  updateScore(matchIndex, side, value) {
    const g = this.globalData
    if (!g.scores[matchIndex]) {
      g.scores[matchIndex] = { a: '', b: '' }
    }
    g.scores[matchIndex][side] = value
    this.saveState()

    if (g.roomCode && db) {
      db.collection('rooms').where({ roomCode: g.roomCode }).get({
        success: (res) => {
          if (res.data && res.data.length) {
            const scores = res.data[0].scores || {}
            if (!scores[matchIndex]) scores[matchIndex] = { a: '', b: '' }
            scores[matchIndex][side] = value
            db.collection('rooms').doc(res.data[0]._id).update({
              data: { scores: scores }
            })
          }
        }
      })
    }
  },

  clearScore(matchIndex) {
    delete this.globalData.scores[matchIndex]
    this.saveState()

    if (this.globalData.roomCode && db) {
      const g = this.globalData
      db.collection('rooms').where({ roomCode: g.roomCode }).get({
        success: (res) => {
          if (res.data && res.data.length) {
            const scores = res.data[0].scores || {}
            delete scores[matchIndex]
            db.collection('rooms').doc(res.data[0]._id).update({
              data: { scores: scores }
            })
          }
        }
      })
    }
  },

  calculateRanking() {
    const g = this.globalData
    return schedule.calculateRanking(g.players, g.schedule, g.scores)
  }
})
