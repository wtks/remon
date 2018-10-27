<template lang="pug">
  v-app
    v-content
      v-container(fluid)
        v-layout(wrap)
          v-flex(xs2)
            v-icon(v-if="state.power === 0" color="red") mdi-circle-outline
            v-icon(v-else-if="state.power === 1" color="blue") mdi-circle
            v-icon(v-else) mdi-help-circle
          v-flex(xs2)
            p {{ currentModeString }}
          v-flex(xs2)
            p {{ currentTempString }}
          v-flex(xs2)
            p 風量 {{ currentVolString }}
          v-flex(xs2)
            p 風向 {{ currentDirString }}
        v-btn(:disabled="!isOnline" @click="pushChanges({Power: 0})" small depressed) オフ
        v-btn(:disabled="!isOnline" @click="pushChanges({power:1, mode:0})" small depressed) 冷房
        v-btn(:disabled="!isOnline" @click="pushChanges({power:1, mode:1})" small depressed) 暖房
        v-btn(:disabled="!isOnline" @click="pushChanges({power:1, mode:2})" small depressed) 除湿
        v-slider(v-model="tempSlider" @change="pushChanges({PresetTemp: $event})" always-dirty min="16" max="30" thumb-label ticks="always" tick-size="2")
        v-slider(v-model="volSlider" @change="pushChanges({AirVolume: $event})" always-dirty min="0" max="6" ticks="always" tick-size="2" :tick-labels="volLabels")
        v-slider(v-model="dirSlider" @change="pushChanges({WindDirection: $event})" always-dirty min="0" max="5" ticks="always" tick-size="2" :tick-labels="dirLabels")
    v-footer.pa-3
      template(v-if="isOnline")
        status-indicator(positive pulse)
        span ONLINE
      template(v-else)
        status-indicator(negative)
        span OFFLINE
      v-spacer
      v-dialog(v-model="settingDialog.open" persistent max-width="600px")
        v-btn(slot="activator" small flat icon)
          v-icon mdi-settings
        v-card
          v-card-title
            span.headline 設定
          v-card-text
            v-container(grid-list-md)
              v-layout(wrap)
                v-flex(xs12)
                  v-text-field(v-model="settingDialog.address" label="MQTTアドレス" required)
                v-flex(xs12)
                  v-text-field(v-model="settingDialog.username" label="MQTTユーザー名")
                v-flex(xs12)
                  v-text-field(v-model="settingDialog.password" label="MQTTパスワード" type="password")
          v-card-actions
            v-spacer
            v-btn(color="blue darken-1" flat @click.native="settingDialog.open = false") 閉じる
            v-btn(color="blue darken-1" flat @click.native="saveSettings(); settingDialog.open = false") 保存

</template>

<script>
import { StatusIndicator } from 'vue-status-indicator'
import mqtt from 'async-mqtt'
import pDebounce from 'p-debounce'

let client
let pendingChanges = {}

export default {
  name: 'app',
  components: {
    StatusIndicator
  },
  data: function () {
    return {
      isOnline: false,
      currentStateRaw: null,
      state: {
        valid: false,
        power: -1,
        mode: -1,
        temp: -1,
        vol: -1,
        dir: -1
      },
      settingDialog: {
        open: false,
        address: '',
        username: '',
        password: ''
      },
      tempSlider: -1,
      dirSlider: -1,
      volSlider: -1,
      modeLabels: ['冷房', '暖房', '除湿'],
      volLabels: ['Auto', '0', '1', '2', '3', '4', '5', 'パワフル'],
      dirLabels: ['Auto', '1', '2', '3', '4', '5']
    }
  },
  computed: {
    currentModeString: function () {
      if (!this.state.valid) return '??'
      if (this.state.mode < 0 || this.state.mode > 2) return '??'
      return this.modeLabels[this.state.mode]
    },
    currentTempString: function () {
      if (!this.state.valid) return '??℃'
      if (this.state.temp < 16 || this.state.temp > 30) return '??℃'
      return this.state.temp + '℃'
    },
    currentVolString: function () {
      if (!this.state.valid) return '??'
      if (this.state.vol < 0 || this.state.vol > 6) return '??'
      return this.volLabels[this.state.vol]
    },
    currentDirString: function () {
      if (!this.state.valid) return '??'
      if (this.state.dir < 0 || this.state.dir > 5) return '??'
      return this.dirLabels[this.state.dir]
    }
  },
  watch: {
    'settingDialog.open': function (v) {
      if (v) {
        this.settingDialog.address = this.$localStorage.get('MQTT_ADDR')
        this.settingDialog.username = this.$localStorage.get('MQTT_USERNAME')
        this.settingDialog.password = this.$localStorage.get('MQTT_PASSWORD')
      }
    },
    'state.temp': function (v) {
      this.tempSlider = v
    },
    'state.dir': function (v) {
      this.dirSlider = v
    },
    'state.vol': function (v) {
      this.volSlider = v
    }
  },
  mounted: async function () {
    await this.connectMQTT()
  },
  methods: {
    connectMQTT: async function () {
      if (client) {
        await client.end()
      }

      const addr = this.$localStorage.get('MQTT_ADDR')
      if (!addr) {
        return
      }

      client = mqtt.connect(addr, {
        clientId: 'remon',
        username: this.$localStorage.get('MQTT_USERNAME'),
        password: this.$localStorage.get('MQTT_PASSWORD')
      })
      client.on('message', this.receiveMessage)
      client.on('offline', () => {
        this.isOnline = false
      })
      client.on('error', e => {
        console.error(e)
      })
      client.on('connect', async () => {
        try {
          this.isOnline = true
          await client.subscribe('/aircon/state')
        } catch (e) {
          console.error(e)
        }
      })
    },
    pushChanges: async function (changes) {
      Object.assign(pendingChanges, changes)
      await this.changeState(pendingChanges)
    },
    changeState: async function (state) {
      const s = Object.assign({}, this.currentStateRaw, state)
      await this.sendState(s)
    },
    sendState: pDebounce(async state => {
      try {
        await client.publish('/aircon/action', JSON.stringify(state))
      } catch (e) {
        console.error(e)
      }
    }, 1000),
    receiveMessage: async function (topic, message, packet) {
      try {
        if (topic === '/aircon/state') {
          const currentState = JSON.parse(message)
          this.currentStateRaw = currentState
          this.state.power = currentState.Power
          this.state.mode = currentState.Mode
          this.state.temp = currentState.PresetTemp
          this.state.vol = currentState.AirVolume
          this.state.dir = currentState.WindDirection
          this.state.valid = true
          pendingChanges = {}
        }
      } catch (e) {
        console.error(e)
      }
    },
    saveSettings: async function () {
      this.$localStorage.set('MQTT_ADDR', this.settingDialog.address)
      this.$localStorage.set('MQTT_USERNAME', this.settingDialog.username)
      this.$localStorage.set('MQTT_PASSWORD', this.settingDialog.password)
      await this.connectMQTT()
    }
  },
  beforeDestroy: async function () {
    await client.end()
  }
}
</script>
