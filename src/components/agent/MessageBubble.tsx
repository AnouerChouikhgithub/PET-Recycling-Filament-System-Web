import { SparklesIcon, UserIcon } from '../icons'
import { ToolCallList } from './ToolCallList'
import { formatTime } from '../../lib/format'
import type { ChatMessage } from '../../lib/agentChat'

/**
 * One transcript bubble. `content` is untrusted model/user text and is
 * rendered as a TEXT NODE only (React escapes it): there is no
 * dangerouslySetInnerHTML, no Markdown, and no link auto-detection anywhere
 * in the agent UI, so model output can never become markup or a URL.
 */
export function MessageBubble({ message }: { message: ChatMessage }) {
  const assistant = message.role === 'assistant'
  const time = message.createdAt ? formatTime(message.createdAt) : ''

  return (
    <article
      className={`agent-msg ${assistant ? 'agent-msg--assistant' : 'agent-msg--user'}`}
      aria-label={assistant ? 'Assistant answer' : 'Your message'}
    >
      <div className="agent-msg-avatar" aria-hidden="true">
        {assistant ? <SparklesIcon size={15} /> : <UserIcon size={15} />}
      </div>
      <div className="agent-msg-body">
        <div className="agent-msg-head">
          <span className="agent-msg-who">{assistant ? 'Assistant' : 'You'}</span>
          {time && (
            <span className="agent-msg-time">
              <time dateTime={message.createdAt}>{time}</time>
            </span>
          )}
        </div>
        <p className="agent-msg-text">{message.content}</p>
        <ToolCallList calls={message.toolCalls} />
      </div>
    </article>
  )
}
