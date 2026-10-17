import { SendIcon } from '../icons'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  sending: boolean
  /** Rate limit active or the assistant surface is disabled. */
  disabled: boolean
  validationError: string | null
  maxChars: number
  /** Callback ref so the page can keep the keyboard flow in the composer. */
  textareaRef?: (element: HTMLTextAreaElement | null) => void
}

/**
 * The message composer. Enter sends, Shift+Enter inserts a newline, the
 * send button is disabled while a turn is pending (the hook also drops a
 * second submit, so a double click can never fire two POSTs).
 */
export function Composer({
  value,
  onChange,
  onSend,
  sending,
  disabled,
  validationError,
  maxChars,
  textareaRef,
}: ComposerProps) {
  const trimmedLength = value.trim().length
  const tooLong = trimmedLength > maxChars
  const canSend = !sending && !disabled && trimmedLength > 0 && !tooLong

  return (
    <form
      className="agent-composer"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSend) onSend()
      }}
    >
      <label className="sr-only" htmlFor="agent-input">
        Ask the assistant about your machine
      </label>
      <textarea
        id="agent-input"
        ref={textareaRef}
        className="agent-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            if (canSend) onSend()
          }
        }}
        placeholder="Ask about your machine — e.g. “what is the latest telemetry?”"
        rows={2}
        disabled={disabled}
        aria-invalid={validationError ? true : undefined}
        aria-describedby="agent-input-hint"
      />

      <div className="agent-composer-bar">
        <p className="agent-input-hint" id="agent-input-hint">
          Enter sends · Shift + Enter adds a line. Answers come from the last data your machine reported and
          can be out of date. The assistant cannot control the machine.
        </p>
        <div className="agent-composer-actions">
          {trimmedLength > maxChars * 0.8 && (
            <span className={`agent-counter ${tooLong ? 'agent-counter--over' : ''}`} aria-live="polite">
              {trimmedLength.toLocaleString('en-US')}/{maxChars.toLocaleString('en-US')}
            </span>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-sm agent-send"
            disabled={!canSend}
            aria-busy={sending}
            aria-label="Send message"
          >
            {sending ? (
              <>
                <span
                  className="spinner"
                  style={{ width: 14, height: 14, borderWidth: 2 }}
                  aria-hidden="true"
                />{' '}
                Sending…
              </>
            ) : (
              <>
                <SendIcon size={15} /> Send
              </>
            )}
          </button>
        </div>
      </div>

      {validationError && (
        <p className="agent-validation" role="alert">
          {validationError}
        </p>
      )}
    </form>
  )
}
