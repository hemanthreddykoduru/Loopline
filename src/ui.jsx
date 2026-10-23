import { useId, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CirclesThreePlus, X } from '@phosphor-icons/react'

export function Brand({ compact = false }) {
  return (
    <a className="ll-brand" href="#/" aria-label="Loopline home" data-testid="brand-home">
      <span className="ll-brand-mark" aria-hidden="true"><CirclesThreePlus size={24} weight="bold" /></span>
      {!compact && <span>Loopline</span>}
    </a>
  )
}

export function Dialog({ title, description, onClose, children, testId, initialFocus }) {
  const id = useId()
  const panelRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useLayoutEffect(() => {
    const panel = panelRef.current
    const layer = panel.parentElement
    const opener = document.activeElement
    const openerTestId = opener?.getAttribute('data-testid')
    const overflow = document.body.style.overflow
    const background = [...document.body.children].filter((element) => element !== layer).map((element) => ({
      element,
      inert: element.getAttribute('inert'),
      hidden: element.getAttribute('aria-hidden'),
    }))
    const focusable = () => [...panel.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.tabIndex >= 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]') && window.getComputedStyle(element).display !== 'none' && window.getComputedStyle(element).visibility !== 'hidden')
    const focusFirst = () => {
      const requested = typeof initialFocus === 'string' ? panel.querySelector(initialFocus) : initialFocus && 'current' in initialFocus ? initialFocus.current : initialFocus
      const target = requested?.nodeType === 1 && panel.contains(requested) && !requested.disabled ? requested : focusable()[0] || panel
      target.focus()
    }

    document.body.style.overflow = 'hidden'
    background.forEach(({ element }) => {
      element.setAttribute('inert', '')
      element.setAttribute('aria-hidden', 'true')
    })
    focusFirst()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      } else if (event.key === 'Tab') {
        const targets = focusable()
        const first = targets[0] || panel
        const last = targets[targets.length - 1] || panel
        if (!panel.contains(document.activeElement) || document.activeElement === panel || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault()
          const target = event.shiftKey ? last : first
          target.focus()
        }
      }
    }
    const onFocusIn = (event) => { if (!panel.contains(event.target)) focusFirst() }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocusIn)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocusIn)
      background.forEach(({ element, inert, hidden }) => {
        if (inert === null) element.removeAttribute('inert')
        else element.setAttribute('inert', inert)
        if (hidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', hidden)
      })
      document.body.style.overflow = overflow
      const fallback = openerTestId && [...document.querySelectorAll('[data-testid]')].find((element) => element.getAttribute('data-testid') === openerTestId)
      const target = opener?.isConnected ? opener : fallback || document.getElementById('main-content')
      target?.focus()
    }
  }, [initialFocus])

  return createPortal(
    <div className="ll-dialog-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="ll-dialog-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined} tabIndex={-1} data-testid={testId}>
        <div className="ll-dialog-header">
          <div>
            <h2 id={`${id}-title`}>{title}</h2>
            {description && <p id={`${id}-description`}>{description}</p>}
          </div>
          <button className="ll-dialog-close" type="button" onClick={onClose} aria-label="Close dialog" data-testid={testId ? `${testId}-close` : undefined}><X size={20} aria-hidden="true" /></button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  )
}
