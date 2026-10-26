import { createApp } from 'vue'
import App from './App.vue'
import { fatalError } from './lib/fatal.js'
import './style.css'

// Mode kiosk: cegah menu klik kanan / tekan lama.
document.addEventListener('contextmenu', (e) => e.preventDefault())

const app = createApp(App)
app.config.errorHandler = (err) => {
  console.error(err)
  fatalError.value = 'Terjadi kesalahan pada aplikasi.'
}
app.mount('#app')
