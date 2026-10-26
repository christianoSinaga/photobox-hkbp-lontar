import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// Mode kiosk: cegah menu klik kanan / tekan lama.
document.addEventListener('contextmenu', (e) => e.preventDefault())

createApp(App).mount('#app')
