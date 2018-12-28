import '@babel/polyfill'
import Vue from 'vue'
import VueLocalStorage from 'vue-localstorage'
import Vuetify from 'vuetify'
import 'vuetify/dist/vuetify.min.css'
import 'vue-status-indicator/styles.css'
import App from './App.vue'
import './registerServiceWorker'

Vue.use(Vuetify, {
  iconfont: 'mdi'
})
Vue.use(VueLocalStorage)
Vue.config.productionTip = false

new Vue({
  render: h => h(App)
}).$mount('#app')
