import { createApp } from 'vue'
import App from './App.vue'
import './assets/style.css'
import './assets/dialogs.scss'
import { initMixpanel } from './services/mixpanel'

initMixpanel()

createApp(App).mount('#app')
