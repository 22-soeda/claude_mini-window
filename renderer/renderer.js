'use strict'

const messagesEl = document.getElementById('messages')
const chatAreaEl = document.getElementById('chat-area')
const inputEl    = document.getElementById('input')
const sendBtn    = document.getElementById('btn-send')
const btnNew     = document.getElementById('btn-new')
const btnMin     = document.getElementById('btn-min')
const btnClose   = document.getElementById('btn-close')

let isLoading = false
let currentBubble  = null   // streaming assistant bubble
let toolStatusEl   = null   // active tool-status element

// ── Helpers ───────────────────────────────────────────────────────────────

function scrollToBottom() {
  chatAreaEl.scrollTop = chatAreaEl.scrollHeight
}

function removeEmptyState() {
  const el = document.getElementById('empty-state')
  if (el) el.remove()
}

function showEmptyState() {
  messagesEl.innerHTML = ''
  const el = document.createElement('div')
  el.id = 'empty-state'
  el.innerHTML = `
    <div class="icon">
      <svg width="32" height="32" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="14" y1="20" x2="28" y2="14" stroke="white" stroke-width="1.2" opacity="0.5"/>
        <line x1="14" y1="20" x2="28" y2="28" stroke="white" stroke-width="1.2" opacity="0.5"/>
        <line x1="14" y1="36" x2="28" y2="28" stroke="white" stroke-width="1.2" opacity="0.5"/>
        <line x1="14" y1="36" x2="28" y2="42" stroke="white" stroke-width="1.2" opacity="0.5"/>
        <line x1="28" y1="14" x2="42" y2="20" stroke="white" stroke-width="1.2" opacity="0.5"/>
        <line x1="28" y1="28" x2="42" y2="20" stroke="white" stroke-width="1.2" opacity="0.5"/>
        <line x1="28" y1="28" x2="42" y2="36" stroke="white" stroke-width="1.2" opacity="0.5"/>
        <line x1="28" y1="42" x2="42" y2="36" stroke="white" stroke-width="1.2" opacity="0.5"/>
        <circle cx="14" cy="20" r="3" fill="white"/>
        <circle cx="14" cy="36" r="3" fill="white"/>
        <circle cx="28" cy="14" r="3" fill="white"/>
        <circle cx="28" cy="28" r="4" fill="white"/>
        <circle cx="28" cy="42" r="3" fill="white"/>
        <circle cx="42" cy="20" r="3" fill="white"/>
        <circle cx="42" cy="36" r="3" fill="white"/>
      </svg>
    </div>
    <div class="empty-title">Claude</div>
    <div class="empty-sub">何でも話しかけてください<br>Notion・カレンダーの操作もできます</div>
  `
  messagesEl.appendChild(el)
}

function createMessageBubble(role) {
  const wrapper = document.createElement('div')
  wrapper.className = `message ${role}`

  const label = document.createElement('div')
  label.className = 'message-label'
  label.textContent = role === 'user' ? 'あなた' : 'Claude'

  const bubble = document.createElement('div')
  bubble.className = 'message-bubble'

  wrapper.appendChild(label)
  wrapper.appendChild(bubble)
  messagesEl.appendChild(wrapper)
  scrollToBottom()
  return bubble
}

function removeToolStatus() {
  if (toolStatusEl) { toolStatusEl.remove(); toolStatusEl = null }
}

function showToolStatus(name, serverName) {
  removeToolStatus()
  const icon = serverName === 'notion' ? '📝' : serverName === 'gcal' ? '📅' : '🔧'
  toolStatusEl = document.createElement('div')
  toolStatusEl.className = 'tool-status'
  toolStatusEl.innerHTML =
    `<span class="ts-icon">${icon}</span><span>ツール実行中: ${name}</span>`
  messagesEl.appendChild(toolStatusEl)
  scrollToBottom()
}

function showError(msg) {
  removeToolStatus()
  const el = document.createElement('div')
  el.className = 'error-msg'
  el.textContent = `⚠️ ${msg}`
  messagesEl.appendChild(el)
  scrollToBottom()
}

function setLoading(loading) {
  isLoading      = loading
  sendBtn.disabled = loading
  inputEl.disabled = loading
  sendBtn.textContent = loading ? '送信中…' : '送信'
  if (!loading) inputEl.focus()
}

// ── Send message ──────────────────────────────────────────────────────────

function sendMessage() {
  const text = inputEl.value.trim()
  if (!text || isLoading) return

  removeEmptyState()
  createMessageBubble('user').textContent = text

  inputEl.value = ''
  inputEl.style.height = 'auto'
  currentBubble = null
  setLoading(true)

  window.api.sendMessage(text)
}

// ── Event listeners ───────────────────────────────────────────────────────

sendBtn.addEventListener('click', sendMessage)

inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
})

// Auto-resize textarea
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto'
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px'
})

// Esc hides window
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') window.api.closeWindow()
})

btnNew.addEventListener('click',   () => { if (!isLoading) window.api.newChat() })
btnMin.addEventListener('click',   () => window.api.minimizeWindow())
btnClose.addEventListener('click', () => window.api.closeWindow())

// ── IPC event handlers ────────────────────────────────────────────────────

window.api.onWindowShown(() => {
  inputEl.focus()
})

window.api.onNewMessage(() => {
  // Prepare a fresh assistant bubble for the upcoming stream
  removeToolStatus()
  currentBubble = createMessageBubble('assistant')
  currentBubble.classList.add('streaming')
})

window.api.onChunk(text => {
  if (!currentBubble) {
    removeToolStatus()
    currentBubble = createMessageBubble('assistant')
    currentBubble.classList.add('streaming')
  }
  currentBubble.textContent += text
  scrollToBottom()
})

window.api.onToolStatus(status => {
  if (status.running) {
    // Remove streaming cursor while tool runs
    if (currentBubble) currentBubble.classList.remove('streaming')
    showToolStatus(status.name, status.serverName)
  } else {
    removeToolStatus()
  }
})

window.api.onError(msg => {
  if (currentBubble) currentBubble.classList.remove('streaming')
  showError(msg)
  setLoading(false)
  currentBubble = null
})

window.api.onComplete(() => {
  if (currentBubble) currentBubble.classList.remove('streaming')
  removeToolStatus()
  setLoading(false)
  currentBubble = null
})

window.api.onChatCleared(() => {
  currentBubble = null
  toolStatusEl  = null
  showEmptyState()
})

// ── Init ──────────────────────────────────────────────────────────────────

showEmptyState()
