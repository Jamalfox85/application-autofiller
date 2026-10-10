import { createApp } from 'vue'
import App from './App.vue'
import ResumeUploadTab from './components/ResumeUploadTab.vue'
import './assets/style.css'
import './assets/dialogs.scss'
import { initMixpanel } from './services/mixpanel'
import { isResumeUploadTab } from './utils/uploadTab'

initMixpanel()

createApp(isResumeUploadTab() ? ResumeUploadTab : App).mount('#app')
