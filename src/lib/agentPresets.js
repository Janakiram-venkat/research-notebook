// One-click prompts for the assistant, offered from the note menu and command palette.
// `askAgent` hands one to the agent panel, which opens itself and sends it.

export const AGENT_PRESETS = [
  { key: 'summarise', label: 'Summarise this note', agent: 'assistant',
    prompt: 'Summarise the note I have open in five bullet points. Do not create or change any notes.' },
  { key: 'quiz', label: 'Quiz me on this note', agent: 'study',
    prompt: 'Quiz me on the note I have open. Ask one question at a time and wait for my answer.' },
  { key: 'next', label: 'What should I revisit next?', agent: 'research',
    prompt: 'Looking across my notebook, what should I read or revisit next, starting from the note I have open? Give at most three, ranked.' },
  { key: 'decision', label: 'Draft a decision entry', agent: 'decision',
    prompt: 'From the options in the note I have open, draft a decision-log entry. Show it to me here first; do not save it yet.' },
]

export function askAgent(preset) {
  window.dispatchEvent(new CustomEvent('nb:agent-ask', { detail: { agent: preset.agent, prompt: preset.prompt } }))
}
