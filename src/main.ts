import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useSettingsStore } from './stores/settingsStore'
import { useDhikrStore } from './stores/dhikrStore'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

const settings = useSettingsStore()
settings.applyTheme()
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => settings.theme === 'system' && settings.applyTheme())
void useDhikrStore().init()

app.mount('#app')
