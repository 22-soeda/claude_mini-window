'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // ── Send actions ──────────────────────────────────────────────────────────
  sendMessage:    text => ipcRenderer.send('send-message', text),
  minimizeWindow: ()   => ipcRenderer.send('window:minimize'),
  maximizeWindow: ()   => ipcRenderer.send('window:maximize'),
  getBounds:      ()   => ipcRenderer.invoke('window:get-bounds'),
  setBounds:      b    => ipcRenderer.send('window:set-bounds', b),
  closeWindow:    ()   => ipcRenderer.send('window:close'),
  newChat:        ()   => ipcRenderer.send('window:new-chat'),

  // ── Event subscriptions ───────────────────────────────────────────────────
  // Returns an unsubscribe function for cleanup (optional).
  onWindowShown: cb => {
    const h = () => cb()
    ipcRenderer.on('window-shown', h)
    return () => ipcRenderer.removeListener('window-shown', h)
  },

  onNewMessage: cb => {
    const h = () => cb()
    ipcRenderer.on('new-message', h)
    return () => ipcRenderer.removeListener('new-message', h)
  },

  onChunk: cb => {
    const h = (_, text) => cb(text)
    ipcRenderer.on('response-chunk', h)
    return () => ipcRenderer.removeListener('response-chunk', h)
  },

  onToolStatus: cb => {
    const h = (_, status) => cb(status)
    ipcRenderer.on('tool-status', h)
    return () => ipcRenderer.removeListener('tool-status', h)
  },

  onError: cb => {
    const h = (_, msg) => cb(msg)
    ipcRenderer.on('response-error', h)
    return () => ipcRenderer.removeListener('response-error', h)
  },

  onComplete: cb => {
    const h = () => cb()
    ipcRenderer.on('response-complete', h)
    return () => ipcRenderer.removeListener('response-complete', h)
  },

  onChatCleared: cb => {
    const h = () => cb()
    ipcRenderer.on('chat-cleared', h)
    return () => ipcRenderer.removeListener('chat-cleared', h)
  },

  onMaximizeChange: cb => {
    const h = (_, isMaximized) => cb(isMaximized)
    ipcRenderer.on('maximize-change', h)
    return () => ipcRenderer.removeListener('maximize-change', h)
  },

  onToolDebug: cb => {
    const h = (_, msg) => cb(msg)
    ipcRenderer.on('tool-debug', h)
    return () => ipcRenderer.removeListener('tool-debug', h)
  }
})
