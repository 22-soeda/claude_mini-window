'use strict'

const messagesEl   = document.getElementById('messages')
const chatAreaEl   = document.getElementById('chat-area')
const inputEl      = document.getElementById('input')
const sendBtn      = document.getElementById('btn-send')
const btnNew       = document.getElementById('btn-new')
const btnMin       = document.getElementById('btn-min')
const btnMax       = document.getElementById('btn-max')
const btnClose     = document.getElementById('btn-close')
const iconMaximize = document.getElementById('icon-maximize')
const iconRestore  = document.getElementById('icon-restore')

let isLoading    = false
let currentBubble  = null   // streaming assistant bubble
let currentRawText = ''     // raw markdown text for current bubble
let toolStatusEl   = null   // active tool-status element
let thinkingEl     = null   // thinking indicator element

// Configure marked
marked.setOptions({ breaks: true, gfm: true })

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

const SERVER_LABEL = { notion: 'Notion', gcal: 'Googleカレンダー' }

function showThinking(label = '考え中') {
  removeThinking()
  thinkingEl = document.createElement('div')
  thinkingEl.className = 'thinking'
  thinkingEl.innerHTML =
    `<span class="thinking-dots"><i></i><i></i><i></i></span>` +
    `<span class="thinking-label">${label}</span>`
  messagesEl.appendChild(thinkingEl)
  scrollToBottom()
}

function updateThinkingLabel(label) {
  if (!thinkingEl) return
  const el = thinkingEl.querySelector('.thinking-label')
  if (el) el.textContent = label
}

function removeThinking() {
  if (thinkingEl) { thinkingEl.remove(); thinkingEl = null }
}

function showToolStatus(name, serverName) {
  removeToolStatus()
  const icon = serverName === 'notion' ? '📝' : serverName === 'gcal' ? '📅' : '🔧'
  toolStatusEl = document.createElement('div')
  toolStatusEl.className = 'tool-status'
  toolStatusEl.innerHTML =
    `<span class="ts-icon">${icon}</span><span>${name}</span>`
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
  isLoading        = loading
  sendBtn.disabled = loading
  inputEl.disabled = loading
  if (!loading) inputEl.focus()
}

// Render accumulated markdown into bubble
function renderMarkdown(bubble, raw) {
  bubble.innerHTML = marked.parse(raw)
}

// ── Send message ──────────────────────────────────────────────────────────

function sendMessage() {
  const text = inputEl.value.trim()
  if (!text || isLoading) return

  removeEmptyState()
  createMessageBubble('user').textContent = text

  inputEl.value = ''
  inputEl.style.height = 'auto'
  currentBubble  = null
  currentRawText = ''
  setLoading(true)
  showThinking('考え中')

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

inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto'
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px'
})

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') window.api.closeWindow()
  if (e.key === 'n' && (e.ctrlKey || e.metaKey) && !isLoading) {
    e.preventDefault()
    window.api.newChat()
  }
})

btnNew.addEventListener('click',   () => { if (!isLoading) window.api.newChat() })
btnMin.addEventListener('click',   () => window.api.minimizeWindow())
btnMax.addEventListener('click',   () => window.api.maximizeWindow())
btnClose.addEventListener('click', () => window.api.closeWindow())

function applyMaximizeState(isMaximized) {
  document.body.classList.toggle('maximized', isMaximized)
  iconMaximize.style.display = isMaximized ? 'none' : ''
  iconRestore.style.display  = isMaximized ? ''     : 'none'
  btnMax.title = isMaximized ? '元のサイズに戻す' : '最大化'
}

// ── IPC event handlers ────────────────────────────────────────────────────

window.api.onWindowShown(() => {
  inputEl.focus()
})

window.api.onNewMessage(() => {
  removeToolStatus()
  currentBubble  = null
  currentRawText = ''
  showThinking('考え中')
})

window.api.onChunk(text => {
  if (!currentBubble) {
    removeThinking()
    removeToolStatus()
    currentBubble  = createMessageBubble('assistant')
    currentRawText = ''
    currentBubble.classList.add('streaming')
  }
  currentRawText += text
  renderMarkdown(currentBubble, currentRawText)
  scrollToBottom()
})

window.api.onToolStatus(status => {
  if (status.running) {
    removeThinking()
    if (currentBubble) {
      // Finalize markdown before switching to tool mode
      renderMarkdown(currentBubble, currentRawText)
      currentBubble.classList.remove('streaming')
    }
    showToolStatus(status.name, status.serverName)
  } else {
    removeToolStatus()
    const svrLabel = SERVER_LABEL[status.lastServerName] || status.lastServerName || ''
    showThinking(svrLabel ? `${svrLabel}の結果を分析中` : '回答を生成中')
  }
})

window.api.onError(msg => {
  removeThinking()
  if (currentBubble) {
    renderMarkdown(currentBubble, currentRawText)
    currentBubble.classList.remove('streaming')
  }
  showError(msg)
  setLoading(false)
  currentBubble  = null
  currentRawText = ''
})

window.api.onComplete(() => {
  removeThinking()
  if (currentBubble) {
    renderMarkdown(currentBubble, currentRawText)
    currentBubble.classList.remove('streaming')
  }
  removeToolStatus()
  setLoading(false)
  currentBubble  = null
  currentRawText = ''
})

window.api.onChatCleared(() => {
  currentBubble  = null
  currentRawText = ''
  toolStatusEl   = null
  thinkingEl     = null
  showEmptyState()
})

window.api.onMaximizeChange(isMaximized => {
  applyMaximizeState(isMaximized)
})

window.api.onToolDebug(msg => {
  const el = document.createElement('div')
  el.className = 'tool-debug'
  el.textContent = `🔍 ${msg}`
  messagesEl.appendChild(el)
  scrollToBottom()
})

// ── Init ──────────────────────────────────────────────────────────────────

showEmptyState()
