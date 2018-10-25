<template lang="pug">
  v-app
    v-content
      v-container(fluid)
        div {{ currentStateString }}
        v-btn(:disabled="!isOnline" @click="postState({})") オフ
        v-btn(:disabled="!isOnline" @click="postState({power:1, mode:0, presetTemp:26})") 冷房26℃
        v-btn(:disabled="!isOnline" @click="postState({power:1, mode:1, presetTemp:26})") 暖房26℃
        v-btn(:disabled="!isOnline" @click="postState({power:1, mode:2, presetTemp:26})") 除湿26℃
    v-footer.pa-3
      template(v-if="isOnline")
        status-indicator(positive)
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

let client

export default {
  name: 'app',
  components: {
    StatusIndicator
  },
  data: function () {
    return {
      isOnline: false,
      currentState: null,
      settingDialog: {
        open: false,
        address: '',
        username: '',
        password: ''
      }
    }
  },
  computed: {
    currentStateString: function () {
      if (this.currentState == null) {
        return '不明'
      } else {
        let str = ''
        switch (this.currentState.Power) {
          case 0:
          case 3:
            return 'オフ'
        }
        switch (this.currentState.Mode) {
          case 0:
            str += '冷房'
            break
          case 1:
            str += '暖房'
            break
          case 2:
            str += '除湿'
            break
        }
        str += this.currentState.PresetTemp
        return str
      }
    }
  },
  watch: {
    'settingDialog.open': function (v) {
      if (v) {
        this.settingDialog.address = this.$localStorage.get('MQTT_ADDR')
        this.settingDialog.username = this.$localStorage.get('MQTT_USERNAME')
        this.settingDialog.password = this.$localStorage.get('MQTT_PASSWORD')
      }
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
    postState: async function (state) {
      try {
        await client.publish('/aircon/action', JSON.stringify(state))
      } catch (e) {
        console.error(e)
      }
    },
    receiveMessage: async function (topic, message, packet) {
      try {
        if (topic === '/aircon/state') {
          this.currentState = JSON.parse(message)
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
