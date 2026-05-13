'use strict'

const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron')
const path = require('path')
const { promises: fs } = require('fs')
const https = require('https')
const Anthropic = require('@anthropic-ai/sdk')
require('dotenv').config()

let mainWindow = null
let anthropic = null

// MCP state (loaded dynamically to handle ESM/CJS compatibility)
let MCPClient = null
let MCPStdioTransport = null
const mcpClients = new Map()     // serverName -> Client
const toolRegistry = new Map()   // prefixedToolName -> { clientName, originalName, displayName }
let availableTools = []

// Conversation history (in-memory, resets on app restart)
const conversationHistory = []

// ── MCP SDK dynamic import ──────────────────────────────────────────────────

async function loadMCPModules() {
  if (MCPClient) return true
  try {
    const clientMod = await import('@modelcontextprotocol/sdk/client/index.js')
    const stdioMod  = await import('@modelcontextprotocol/sdk/client/stdio.js')
    MCPClient       = clientMod.Client
    MCPStdioTransport = stdioMod.StdioClientTransport
    return true
  } catch (err) {
    console.warn('[MCP] SDK load failed – running without tool integration:', err.message)
    return false
  }
}

// ── MCP server initialization ───────────────────────────────────────────────

async function initMCPServer(name, command, args, envVars) {
  const ok = await loadMCPModules()
  if (!ok) return []

  try {
    const transport = new MCPStdioTransport({
      command,
      args,
      env: { ...process.env, ...envVars }
    })

    const client = new MCPClient(
      { name: `claude-mini-${name}`, version: '1.0.0' },
      { capabilities: {} }
    )

    await client.connect(transport)
    mcpClients.set(name, client)

    const { tools = [] } = await client.listTools()
    console.log(`[MCP] ${name}: ${tools.length} tools loaded`)
    console.log(`[MCP] ${name} tool names:`, tools.map(t => t.name).join(', '))

    return tools.map(tool => {
      const prefixedName = `${name}__${tool.name}`
      toolRegistry.set(prefixedName, {
        clientName:  name,
        originalName: tool.name,
        displayName:  tool.name.replace(/_/g, ' ')
      })
      return {
        name:         prefixedName,
        description:  tool.description || `${name}: ${tool.name}`,
        input_schema: tool.inputSchema || { type: 'object', properties: {} }
      }
    })
  } catch (err) {
    console.error(`[MCP] ${name} init failed:`, err.message)
    return []
  }
}

// ── Google Calendar credential helpers ─────────────────────────────────────

const GCAL_CRED_PATH  = path.join(__dirname, 'gcp-oauth.keys.json')
const GCAL_TOKEN_PATH = path.join(__dirname, '.gcal-tokens.json')

function refreshGcalAccessToken(clientId, clientSecret, refreshToken) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token'
    }).toString()

    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path:     '/token',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.access_token) resolve(json)
          else reject(new Error(json.error_description || json.error || 'Token refresh failed'))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function prepareGcalCredentials() {
  // Write credentials file from env vars (overwrite each launch to pick up changes)
  const creds = {
    installed: {
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uris: ['http://localhost']
    }
  }
  await fs.writeFile(GCAL_CRED_PATH, JSON.stringify(creds, null, 2))

  // Always refresh to get a live access token so the MCP server doesn't trigger browser auth
  try {
    const tokenData = await refreshGcalAccessToken(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET || '',
      process.env.GOOGLE_REFRESH_TOKEN
    )
    const tokens = {
      normal: {
        access_token:  tokenData.access_token,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        token_type:    tokenData.token_type || 'Bearer',
        expiry_date:   Date.now() + (tokenData.expires_in || 3600) * 1000
      }
    }
    await fs.writeFile(GCAL_TOKEN_PATH, JSON.stringify(tokens, null, 2))
    console.log('[MCP] gcal: access token refreshed successfully')
  } catch (err) {
    console.error('[MCP] gcal: token refresh failed:', err.message)
    // Fall back to refresh-token-only file if refresh fails
    try { await fs.access(GCAL_TOKEN_PATH) } catch {
      const tokens = { normal: { refresh_token: process.env.GOOGLE_REFRESH_TOKEN, token_type: 'Bearer', expiry_date: 0 } }
      await fs.writeFile(GCAL_TOKEN_PATH, JSON.stringify(tokens, null, 2))
    }
  }
}

async function initMCP() {
  const tools = []

  // Notion
  if (process.env.NOTION_API_KEY) {
    const cmd  = process.env.NOTION_MCP_COMMAND || 'npx'
    const args = process.env.NOTION_MCP_ARGS
      ? process.env.NOTION_MCP_ARGS.split(' ')
      : ['-y', '@notionhq/notion-mcp-server@1.9.1']

    const notionTools = await initMCPServer('notion', cmd, args, {
      OPENAPI_MCP_HEADERS: JSON.stringify({
        Authorization:    `Bearer ${process.env.NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28'
      })
    })
    tools.push(...notionTools)
  }

  // Google Calendar (@cocal/google-calendar-mcp)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) {
    await prepareGcalCredentials()

    const cmd  = process.env.GCAL_MCP_COMMAND || 'npx'
    const args = process.env.GCAL_MCP_ARGS
      ? process.env.GCAL_MCP_ARGS.split(' ')
      : ['-y', '@cocal/google-calendar-mcp']

    const gcalTools = await initMCPServer('gcal', cmd, args, {
      GOOGLE_OAUTH_CREDENTIALS:         GCAL_CRED_PATH,
      GOOGLE_CALENDAR_MCP_TOKEN_PATH:   GCAL_TOKEN_PATH
    })
    tools.push(...gcalTools)
  }

  availableTools = tools
  console.log(`[MCP] Total tools available: ${availableTools.length}`)
}

// ── Tool execution ──────────────────────────────────────────────────────────

async function executeMCPTool(toolName, toolInput) {
  const entry = toolRegistry.get(toolName)
  if (!entry) throw new Error(`Tool not found in registry: ${toolName}`)

  const client = mcpClients.get(entry.clientName)
  if (!client) throw new Error(`MCP client not available: ${entry.clientName}`)

  console.log(`[MCP] calling tool "${entry.originalName}" (${entry.clientName}) with:`, JSON.stringify(toolInput).slice(0, 200))

  const result = await client.callTool({
    name:      entry.originalName,
    arguments: toolInput || {}
  })

  if (result.isError) {
    const errText = Array.isArray(result.content)
      ? result.content.map(c => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n')
      : JSON.stringify(result)
    console.error(`[MCP] tool "${entry.originalName}" returned an error:`, errText.slice(0, 500))
    return errText
  }

  if (Array.isArray(result.content)) {
    return result.content
      .map(c => c.type === 'text' ? c.text : JSON.stringify(c))
      .join('\n')
  }
  return JSON.stringify(result)
}

// ── Tool schema compaction (reduces input token usage) ───────────────────────

function compactSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema
  const result = {}
  if (schema.type)        result.type        = schema.type
  if (schema.description) result.description = schema.description
  if (schema.enum)        result.enum        = schema.enum
  if (schema.properties) {
    result.properties = {}
    for (const [k, v] of Object.entries(schema.properties)) {
      result.properties[k] = compactSchema(v)
    }
  }
  if (schema.items)    result.items    = compactSchema(schema.items)
  if (schema.required) result.required = schema.required
  return result
}

function compactTools(tools) {
  return tools.map(t => ({
    name:         t.name,
    description:  t.description,
    input_schema: compactSchema(t.input_schema)
  }))
}

// ── Anthropic API / agentic loop ────────────────────────────────────────────

async function handleChat(win, userMessage) {
  // Read system prompt fresh on every request (no restart needed after edits)
  let systemPrompt = 'You are a helpful assistant.'
  try {
    systemPrompt = await fs.readFile(
      path.join(__dirname, 'system_prompt.txt'), 'utf-8'
    )
  } catch { /* file missing is fine */ }

  conversationHistory.push({ role: 'user', content: userMessage })

  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'

  let continueLoop = true
  let isFirstRound = true

  while (continueLoop) {
    if (!isFirstRound) {
      win.webContents.send('new-message')
    }
    isFirstRound = false

    const params = {
      model,
      max_tokens: 4096,
      system:     systemPrompt,
      messages:   conversationHistory
    }
    if (availableTools.length > 0) params.tools = compactTools(availableTools)

    try {
      const stream = anthropic.messages.stream(params)

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          win.webContents.send('response-chunk', event.delta.text)
        }
      }

      const finalMsg = await stream.finalMessage()

      // Persist full content (including tool_use blocks) in history
      conversationHistory.push({ role: 'assistant', content: finalMsg.content })

      const toolUseBlocks = finalMsg.content.filter(b => b.type === 'tool_use')

      if (toolUseBlocks.length === 0 || finalMsg.stop_reason !== 'tool_use') {
        continueLoop = false
        win.webContents.send('response-complete')
        break
      }

      // Execute all requested tools
      const toolResults = []
      let lastServerName = ''

      for (const block of toolUseBlocks) {
        const entry = toolRegistry.get(block.name)
        const serverName = entry ? entry.clientName : ''
        if (serverName) lastServerName = serverName
        win.webContents.send('tool-status', {
          running:    true,
          name:       entry ? entry.displayName : block.name,
          serverName
        })

        try {
          const content = await executeMCPTool(block.name, block.input)
          console.log(`[MCP] tool result for "${block.name}":`, content.slice(0, 300))
          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content
          })
        } catch (err) {
          const errMsg = err.message || String(err)
          console.error(`[MCP] tool execution error for "${block.name}":`, err)
          win.webContents.send('tool-debug', `[${entry?.clientName ?? block.name}] ${errMsg}`)
          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content:     `Error: ${errMsg}`,
            is_error:    true
          })
        }
      }

      win.webContents.send('tool-status', { running: false, lastServerName })

      conversationHistory.push({ role: 'user', content: toolResults })
      // Loop continues → send tool results back to Claude

    } catch (err) {
      win.webContents.send('response-error', err.message)
      continueLoop = false
    }
  }
}

// ── Window creation ─────────────────────────────────────────────────────────

function createWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width:          600,
    height:         500,
    minWidth:       360,
    minHeight:      280,
    x:              Math.floor((width - 600) / 2),
    y:              80,
    titleBarStyle:  'hidden',   // タイトルバーを非表示にしつつ OS のリサイズ枠を保持
    backgroundColor: '#FCFCFF',
    alwaysOnTop:    true,
    skipTaskbar:    true,
    resizable:      true,
    show:           false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.on('maximize',   () => sendMaximizeState())
  mainWindow.on('unmaximize', () => sendMaximizeState())
  mainWindow.on('enter-full-screen', () => sendMaximizeState())
  mainWindow.on('leave-full-screen', () => sendMaximizeState())

  // Hide when focus leaves the window
  mainWindow.on('blur', () => {
    if (mainWindow && mainWindow.isVisible()) mainWindow.hide()
  })

  // Intercept close → just hide
  mainWindow.on('close', e => {
    e.preventDefault()
    mainWindow.hide()
  })
}

// ── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.on('send-message', async (event, message) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) await handleChat(win, message)
})

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:close',    () => mainWindow?.hide())

ipcMain.handle('window:get-bounds', () => mainWindow?.getBounds() ?? null)

ipcMain.on('window:set-bounds', (_, bounds) => {
  if (!mainWindow) return
  mainWindow.setBounds({
    x:      Math.round(bounds.x),
    y:      Math.round(bounds.y),
    width:  Math.round(bounds.width),
    height: Math.round(bounds.height)
  })
})

ipcMain.on('window:maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
})

// Notify renderer when maximize state changes
function sendMaximizeState() {
  if (mainWindow) {
    mainWindow.webContents.send('maximize-change', mainWindow.isMaximized())
  }
}

ipcMain.on('window:new-chat', () => {
  conversationHistory.length = 0
  mainWindow?.webContents.send('chat-cleared')
})

// ── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Register app to launch at system login (Windows / macOS)
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
    path: process.execPath,
    args: [`"${app.getAppPath()}"`]
  })

  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  await initMCP()
  createWindow()

  globalShortcut.register('Alt+Space', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('window-shown')
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  for (const client of mcpClients.values()) {
    try { client.close?.() } catch { /* ignore */ }
  }
})

// Keep the process alive even when all windows are closed
app.on('window-all-closed', () => { /* intentional no-op */ })
