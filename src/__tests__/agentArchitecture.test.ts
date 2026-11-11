import { describe, expect, it } from 'vitest'

/**
 * Architectural regression tests (the web counterpart of the backend's
 * registry-lock test). They fail if a future change gives the assistant UI a
 * path to machine control, a second polling loop, provider credentials, or an
 * unsafe rendering primitive.
 *
 * Sources are pulled in through Vite's raw glob so the test needs no Node
 * type definitions; a missing file is a hard error, never a silent pass.
 */
const RAW = import.meta.glob('../**/*.{ts,tsx,css}', { eager: true, query: '?raw', import: 'default' }) as Record<
  string,
  string
>

function read(suffix: string): string {
  const key = Object.keys(RAW).find((path) => path.endsWith(`/${suffix}`))
  if (!key) throw new Error(`no captured source for ${suffix}`)
  return RAW[key]
}

const AGENT_FILES = [
  'components/agent/AgentNotices.tsx',
  'components/agent/Composer.tsx',
  'components/agent/MessageBubble.tsx',
  'components/agent/SuggestedPrompts.tsx',
  'components/agent/ToolCallList.tsx',
  'pages/AgentChatPage.tsx',
  'api/agent.ts',
  'lib/useAgentChat.ts',
  'lib/agentChat.ts',
  'lib/telemetryFreshness.ts',
]

describe('agent UI — the source set is real', () => {
  it('reads every agent source file', () => {
    for (const file of AGENT_FILES) {
      expect(read(file).length, `${file} must be readable`).toBeGreaterThan(100)
    }
  })
})

describe('agent UI — no path to machine control', () => {
  it('never references the command API or the machine command service', () => {
    for (const file of AGENT_FILES) {
      const source = read(file)
      expect(source, `${file} must not send machine commands`).not.toMatch(/sendMachineCommand/)
      expect(source, `${file} must not call the commands endpoint`).not.toMatch(/\/commands/)
      expect(source, `${file} must not import the machine API`).not.toMatch(/api\/machines/)
      expect(source, `${file} must not reference MachineCommandService`).not.toMatch(/MachineCommandService/)
    }
  })

  it('starts no second polling loop (no realtime subscription in chat code)', () => {
    for (const file of AGENT_FILES) {
      const source = read(file)
      expect(source, `${file} must not use realtimeService`).not.toMatch(/realtimeService/)
    }
  })

  it('never talks to the model provider directly and holds no credentials', () => {
    for (const file of AGENT_FILES) {
      const source = read(file)
      expect(source, `${file} must not mention the provider`).not.toMatch(/anthropic/i)
      expect(source, `${file} must not contain a key literal`).not.toMatch(/sk-ant/)
      expect(source, `${file} must not read process env secrets`).not.toMatch(/process\.env/)
    }
  })
})

describe('agent UI — safe rendering only', () => {
  it('uses no raw-HTML or code-eval primitive', () => {
    for (const file of AGENT_FILES) {
      const source = read(file)
      // Property/assignment use only: the files' own prose explains the ban.
      expect(source, `${file} must not use dangerouslySetInnerHTML`).not.toMatch(/dangerouslySetInnerHTML\s*[:=]/)
      expect(source, `${file} must not write innerHTML`).not.toMatch(/\.innerHTML\s*=/)
      expect(source, `${file} must not eval`).not.toMatch(/[^.\w]eval\(/)
      expect(source, `${file} must not build code from a string`).not.toMatch(/new Function\(/)
    }
  })

  it('documents that assistant content is text-only in the renderer itself', () => {
    expect(read('components/agent/MessageBubble.tsx')).toMatch(/TEXT NODE only/)
  })

  it('renders untrusted text through the pre-wrap text class (not as markup)', () => {
    // CSS files are stubbed empty under Vitest, so the stylesheet link itself
    // is checked here; the rendered white-space value is verified in the
    // browser pass (see docs/ai-agent-web-integration.md).
    const bubble = read('components/agent/MessageBubble.tsx')
    expect(bubble).toMatch(/className="agent-msg-text"/)
    expect(bubble).toMatch(/\{message\.content\}/)
  })
})

describe('agent UI — navigation wiring', () => {
  it('is reachable from the shell router and the sidebar, and renders in the app shell', () => {
    expect(read('lib/router.ts')).toMatch(/'agent'/)
    expect(read('components/layout/Sidebar.tsx')).toMatch(/route: 'agent'/)
    expect(read('App.tsx')).toMatch(/route === 'agent' && <AgentChatPage \/>/)
  })

  it('is styled from a dedicated stylesheet loaded by the app entry', () => {
    expect(read('main.tsx')).toMatch(/styles\/agent\.css/)
  })
})
