import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle, Eye, EyeSlash, GitBranch, GitCommit, GithubLogo, ShieldCheck } from '@phosphor-icons/react'
import { Brand } from './ui'
import './public.css'

const repositoryUrl = 'https://github.com/hemanthreddykoduru/Loopline'

function RouteLink({ to, navigate, children, ...props }) {
  return <a href={`#${to}`} {...props} onClick={(event) => {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault()
      navigate(to)
    }
  }}>{children}</a>
}

function SectionLink({ target, children, ...props }) {
  return <a href={`#${target}`} {...props} onClick={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const section = document.getElementById(target)
    section?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
    section?.focus({ preventScroll: true })
  }}>{children}</a>
}

export function Reveal({ as: Element = 'div', className = '', children, ...props }) {
  const elementRef = useRef(null)
  const [state, setState] = useState('ready')

  useEffect(() => {
    const element = elementRef.current
    const browser = typeof window === 'undefined' ? null : window
    const reducedMotion = typeof browser?.matchMedia === 'function'
      && browser.matchMedia('(prefers-reduced-motion: reduce)').matches
    const Observer = browser?.IntersectionObserver

    if (!element || reducedMotion || typeof Observer !== 'function') return undefined

    let active = true
    let observer
    try {
      setState('pending')
      observer = new Observer((entries) => {
        if (!active || !entries.some((entry) => entry.isIntersecting)) return
        active = false
        setState('revealed')
        observer?.disconnect()
      }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' })
      observer.observe(element)
    } catch {
      setState('ready')
    }

    return () => {
      active = false
      observer?.disconnect()
    }
  }, [])

  const revealClassName = ['pub-reveal', state === 'ready' ? '' : `pub-reveal-${state}`, className].filter(Boolean).join(' ')
  return <Element ref={elementRef} className={revealClassName} {...props}>{children}</Element>
}

export function LandingPage({ navigate, user, preview }) {
  const destination = user ? '/app' : '/signup'
  const cta = user ? 'Open workspace' : 'Create account'
  const illustrativePreview = (
    <div className="pub-evidence-preview" aria-label="Illustrative evidence preview">
      <div className="pub-preview-header">
        <span className="pub-preview-label">Illustrative evidence view</span>
        <span className="pub-preview-notice">Sample data · not live</span>
      </div>

      <div className="pub-preview-repository">
        <span className="pub-preview-icon" aria-hidden="true"><GithubLogo size={20} /></span>
        <span className="pub-preview-repository-copy"><strong>Loopline / public repository</strong><small>Read-only GitHub source</small></span>
        <ArrowUpRight size={16} aria-hidden="true" />
      </div>

      <div className="pub-preview-commit">
        <div className="pub-preview-commit-heading"><span className="pub-data-label">Commit under review</span><span className="pub-commit-ref">main</span></div>
        <code>9d3b756a9226bb38170cf87a3545182ed4c5190f</code>
        <p><GitCommit size={15} aria-hidden="true" /> Exact commit SHA · source linked</p>
      </div>

      <div className="pub-preview-checks">
        <div className="pub-preview-checks-heading"><span>Published checks</span><small>from GitHub</small></div>
        <ul>
          <li>
            <CheckCircle className="pub-preview-check-icon" size={18} aria-hidden="true" />
            <span className="pub-preview-check-copy"><strong>TestSprite</strong><small>Published check</small></span>
            <span className="pub-preview-check-state">observed</span>
          </li>
          <li>
            <CheckCircle className="pub-preview-check-icon" size={18} aria-hidden="true" />
            <span className="pub-preview-check-copy"><strong>GitHub Actions</strong><small>Published check</small></span>
            <span className="pub-preview-check-state">reported</span>
          </li>
          <li>
            <ShieldCheck className="pub-preview-check-icon" size={18} aria-hidden="true" />
            <span className="pub-preview-check-copy"><strong>Source access</strong><small>Public, read-only</small></span>
            <span className="pub-preview-check-state">verified</span>
          </li>
        </ul>
      </div>

      <p className="pub-preview-footnote">Illustrative view · no repository is connected here.</p>
    </div>
  )

  return (
    <div className="pub-page">
      <a className="pub-skip" href="#pub-main" onClick={(event) => { event.preventDefault(); const main = document.getElementById('pub-main'); main?.scrollIntoView?.(); main?.focus() }}>Skip to content</a>
      <header className="pub-header pub-wrap">
        <Brand />
        <nav className="pub-nav" aria-label="Main navigation">
          <SectionLink target="product" data-testid="landing-nav-product">Product</SectionLink>
          <a href={repositoryUrl} target="_blank" rel="noopener noreferrer" data-testid="landing-nav-repository">Repository <ArrowUpRight size={13} aria-hidden="true" /></a>
          <SectionLink target="help" data-testid="landing-nav-help">Help</SectionLink>
        </nav>
        <div className="pub-account-nav">
          {!user && <RouteLink className="pub-login" to="/login" navigate={navigate} data-testid="landing-nav-login">Log in</RouteLink>}
          <RouteLink className="pub-button pub-button-primary pub-nav-cta" to={destination} navigate={navigate} data-testid="landing-nav-cta">{cta}<ArrowRight size={16} aria-hidden="true" /></RouteLink>
        </div>
      </header>

        <main id="pub-main" tabIndex={-1}>
          <section className="pub-hero pub-wrap" aria-labelledby="pub-hero-title">
            <div className="pub-hero-copy">
              <p className="pub-eyebrow"><GitBranch size={16} aria-hidden="true" /> Release readiness, grounded in GitHub</p>
              <h1 id="pub-hero-title">Ship the<br className="pub-hero-break" /> right commit.</h1>
              <p className="pub-hero-description">Review one release against one exact commit and the checks GitHub has already published. Nothing is written back.</p>
              <div className="pub-hero-actions">
                <RouteLink className="pub-button pub-button-primary" to={destination} navigate={navigate} data-testid="landing-hero-cta">{cta}<ArrowRight size={18} aria-hidden="true" /></RouteLink>
                <SectionLink className="pub-text-link" target="workflow" data-testid="landing-workflow-link">See the workflow <ArrowRight size={16} aria-hidden="true" /></SectionLink>
              </div>
            </div>
            <figure className="pub-preview" aria-label="Loopline repository evidence" data-testid="landing-preview">
              <div className="pub-preview-content">
                {preview || illustrativePreview}
              </div>
              <figcaption><span className="pub-caption-mark" aria-hidden="true" /><span>Commit-linked evidence, from the workspace.</span></figcaption>
            </figure>
          </section>

          <section className="pub-principles" id="product" tabIndex={-1} aria-labelledby="pub-product-title">
            <div className="pub-wrap pub-principles-grid">
              <div className="pub-section-intro">
                <h2 id="pub-product-title">Make release readiness legible.</h2>
                <p>A passing check only helps when the team can see what it belongs to. Loopline keeps the commit, its source, and its published checks in the same frame.</p>
              </div>
              <div className="pub-principles-rail">
                 <Reveal as="article">
                   <span className="pub-principle-index">01</span>
                   <div><h3>Start with the exact SHA</h3><p>Tie a release review to the version of the code your team is actually discussing.</p></div>
                   <GitCommit size={22} aria-hidden="true" />
                 </Reveal>
                 <Reveal as="article">
                   <span className="pub-principle-index">02</span>
                   <div><h3>Read published checks</h3><p>See check runs and commit statuses reported by GitHub, then follow the original result for detail.</p></div>
                   <CheckCircle size={22} aria-hidden="true" />
                 </Reveal>
                 <Reveal as="article">
                   <span className="pub-principle-index">03</span>
                   <div><h3>Keep the boundary clear</h3><p>Public, read-only GitHub access means Loopline observes evidence without running tests or changing code.</p></div>
                   <ShieldCheck size={22} aria-hidden="true" />
                 </Reveal>
               </div>
            </div>
          </section>

          <section className="pub-workflow pub-wrap" id="workflow" tabIndex={-1} aria-labelledby="pub-workflow-title">
            <div className="pub-workflow-heading">
              <h2 id="pub-workflow-title">From repository<br />to release review.</h2>
              <p>Your CI stays in GitHub. Loopline gives its results a shared place in the release process.</p>
              <a className="pub-text-link" href={repositoryUrl} target="_blank" rel="noopener noreferrer" data-testid="landing-source-link"><GithubLogo size={18} aria-hidden="true" /> View the project <ArrowUpRight size={15} aria-hidden="true" /></a>
            </div>
             <ol className="pub-steps">
               <Reveal as="li"><span className="pub-step-number" aria-hidden="true">01</span><div><h3>Connect a public repository</h3><p>Add the GitHub owner and repository name. Your workspace starts empty until you connect it.</p></div><span className="pub-step-tag">source</span></Reveal>
               <Reveal as="li"><span className="pub-step-number" aria-hidden="true">02</span><div><h3>Choose the commit to review</h3><p>Create a release around its exact SHA, with a clear reference back to the source.</p></div><span className="pub-step-tag">commit</span></Reveal>
               <Reveal as="li"><span className="pub-step-number" aria-hidden="true">03</span><div><h3>Review the evidence together</h3><p>Read the checks attached to that commit and open GitHub when you need the underlying details.</p></div><span className="pub-step-tag">evidence</span></Reveal>
             </ol>
          </section>

          <section className="pub-help pub-wrap" id="help" tabIndex={-1} aria-labelledby="pub-help-title">
            <div className="pub-help-intro">
              <h2 id="pub-help-title">Know what you’re connecting.</h2>
              <p>Loopline is deliberately narrow: a shared read of GitHub evidence, with no hidden automation behind the result.</p>
            </div>
             <Reveal className="pub-questions">
               <details open><summary>Which repositories can I connect?</summary><p>The first connector reads public GitHub repositories only. Private repositories and GitHub App authorization are not supported. Your Loopline account is separate from repository access.</p></details>
               <details><summary>Does Loopline run tests or change code?</summary><p>No. Loopline reads evidence from checks and statuses already reported to GitHub. It does not run your test suite, push commits, or automatically fix code.</p></details>
               <details><summary>What if GitHub has no results?</summary><p>Missing evidence stays visible. A new workspace is empty, and a failed or rate-limited GitHub request shows an error rather than invented results.</p></details>
             </Reveal>
           </section>

           <Reveal as="section" className="pub-final-cta" aria-labelledby="pub-final-cta-title">
             <div className="pub-wrap pub-final-cta-inner">
               <div>
                <h2 id="pub-final-cta-title">Keep the evidence close to the release.</h2>
                <p>Start with one public repository and one commit your team needs to review.</p>
               </div>
               <RouteLink className="pub-button pub-button-primary" to={destination} navigate={navigate} data-testid="landing-bottom-cta">{cta}<ArrowRight size={18} aria-hidden="true" /></RouteLink>
             </div>
           </Reveal>
        </main>

        <footer className="pub-footer pub-wrap"><Brand /><p>Release evidence, tied to the source.</p><a href={repositoryUrl} target="_blank" rel="noopener noreferrer" data-testid="landing-footer-repository">Project on GitHub <ArrowUpRight size={14} aria-hidden="true" /></a></footer>
      </div>
  )
}

function PasswordField({ id, name, label, value, onChange, autoComplete, minLength, error, hint, testId }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-wrap">
        <input className="auth-input" id={id} name={name} type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} minLength={minLength} required aria-invalid={Boolean(error)} aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined} data-testid={testId} />
        <button className="auth-password-toggle" type="button" onClick={() => setVisible(!visible)} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} data-testid={`${testId}-toggle`}>{visible ? <EyeSlash size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button>
      </div>
      {hint && <p className="auth-field-hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="auth-field-error" id={`${id}-error`}>{error}</p>}
    </div>
  )
}

function isUnverified(error) {
  return /(?:email|account).*not.*(?:verified|confirmed)|unverified|verify (?:your |the )?email|(?:email )?(?:verification|confirmation) required/i.test(`${error?.code || ''} ${error?.message || ''}`.replaceAll('_', ' '))
}

function authErrorMessage(error, context) {
  const status = Number(error?.statusCode || error?.status || 0)
  const message = typeof error?.message === 'string' ? error.message : ''
  if (status === 429 || /rate limit|too many|too frequent/i.test(message)) return 'Too many requests. Please wait a moment before trying again.'
  if (status >= 500) return 'The authentication service is unavailable. Please try again shortly.'
  if (/fetch|network|load failed|connection|timed? ?out/i.test(message)) return 'We couldn’t reach the authentication service. Check your connection and try again.'
  const privateDetail = /not found|could(?: not|n't) find|does not exist|doesn't exist|not registered|unregistered|no (matching |registered |active )?(user|account)|unknown (user|email|account)|already (registered|exists|in use)|email.*taken|invalid credentials|invalid.*(email|password)|incorrect.*(email|password)/i.test(`${error?.code || ''} ${message}`.replaceAll('_', ' '))
  if (context === 'forgot-password') return 'We couldn’t request a reset code. Please try again shortly.'
  if (context === 'resend-verification') return 'We couldn’t request a verification code. Please try again shortly.'
  if (context === 'login' && (privateDetail || status === 400 || status === 401 || status === 404)) return 'We couldn’t sign you in with those details. Check your email and password, or reset your password.'
  if (privateDetail || status === 404) {
    if (context === 'signup') return 'We couldn’t create an account with those details. Try logging in or resetting your password.'
    if (context === 'verify' || context === 'reset-password') return 'We couldn’t verify those details. Check your email and code, or request a new code.'
    return 'We couldn’t complete that request. Please check your details and try again.'
  }
  if (message && message.length <= 260 && !/token|stack|sql|postgres|internal server/i.test(message)) return message
  return 'The authentication request failed. Please try again.'
}

export function AuthPage(props) {
  return <AuthFlow key={props.mode} {...props} />
}

function AuthFlow({ mode = 'login', navigate, auth, authConfig, onAuthenticated, initialEmail = '', onResetRequested, unavailableReason = '' }) {
  const id = useId()
  const formRef = useRef(null)
  const headingRef = useRef(null)
  const alive = useRef(true)
  const busy = useRef(false)
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [code, setCode] = useState('')
  const [verification, setVerification] = useState(false)
  const [pending, setPending] = useState('')
  const [errors, setErrors] = useState({})
  const [feedback, setFeedback] = useState(null)
  const [cooldown, setCooldown] = useState(0)
  const [resetRequested, setResetRequested] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const newPasswordMinimum = Math.max(10, Number(authConfig?.passwordMinLength) || 6)
  const requireVerification = authConfig?.requireEmailVerification !== false
  const configIssue = unavailableReason || (!auth ? 'The email authentication service is not configured. Please reload after the service connection is restored.' : '')
    || (mode === 'signup' && !verification && authConfig?.disableSignup ? 'Account creation is disabled for this service. Please log in with an existing account.' : '')
    || ((verification || (mode === 'signup' && requireVerification)) && authConfig?.verifyEmailMethod && authConfig.verifyEmailMethod !== 'code' ? 'This service is not configured for email verification codes. Please contact the workspace administrator.' : '')
    || ((mode === 'forgot-password' || mode === 'reset-password') && authConfig?.resetPasswordMethod && authConfig.resetPasswordMethod !== 'code' ? 'This service is not configured for password reset codes. Please contact the workspace administrator.' : '')

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  useEffect(() => { headingRef.current?.focus() }, [verification, resetDone])
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  function changeField(setter, name, value) {
    setter(value)
    setErrors((current) => ({ ...current, [name]: '' }))
    setFeedback((current) => current?.type === 'error' ? null : current)
  }

  async function request(method, payload) {
    if (typeof auth?.[method] !== 'function') throw new Error('This authentication action is not configured. Please reload after the service connection is restored.')
    const result = await auth[method](payload)
    if (result?.error) throw result.error
    if (!result?.data || result.data.success === false) throw new Error('The authentication service did not confirm this request. Please try again.')
    return result.data
  }

  function authenticate(data) {
    if (!data?.user || typeof data.accessToken !== 'string' || !data.accessToken.trim()) throw new Error('The service did not return a signed-in session. Please try logging in again.')
    if (!alive.current) return
    setPassword('')
    setCode('')
    setFeedback({ type: 'success', message: 'Signed in. Opening your workspace…' })
    onAuthenticated(data.user)
  }

  async function run(action, operation, context = mode) {
    if (busy.current || configIssue) return
    busy.current = true
    setPending(action)
    setFeedback(null)
    try {
      await operation()
    } catch (error) {
      if (!alive.current) return
      if (mode === 'login' && !verification && isUnverified(error)) {
        setVerification(true)
        setPassword('')
        setCode('')
        setFeedback({ type: 'info', message: 'Verify your email to finish signing in. Enter your verification code or request a new one below.' })
      } else setFeedback({ type: 'error', message: authErrorMessage(error, context) })
    } finally {
      busy.current = false
      if (alive.current) setPending('')
    }
  }

  function validate() {
    const next = {}
    if (!verification) {
      if (!email.trim()) next.email = 'Enter your email address.'
      else if (formRef.current?.elements.namedItem('email')?.validity.typeMismatch) next.email = 'Enter a valid email address.'
    }
    if (verification || mode === 'reset-password') {
      if (!/^\d{6}$/.test(code)) next.code = 'Enter the 6-digit code from your email.'
    }
    if (!verification && (mode === 'login' || mode === 'signup' || mode === 'reset-password')) {
      if (!password) next.password = 'Enter your password.'
      else if (mode !== 'login' && password.length < newPasswordMinimum) next.password = `Use at least ${newPasswordMinimum} characters.`
      if (mode === 'reset-password' && confirmation !== password) next.confirmation = 'Your passwords must match.'
    }
    setErrors(next)
    if (Object.keys(next).length) {
      setFeedback(null)
      formRef.current?.elements.namedItem(Object.keys(next)[0])?.focus()
      return false
    }
    return true
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (busy.current || configIssue || !validate()) return
    const address = email.trim()
    void run('submit', async () => {
      if (verification) {
        authenticate(await request('verifyEmail', { email: address, otp: code }))
      } else if (mode === 'signup') {
        const data = await request('signUp', { email: address, password })
        if (!alive.current) return
        if (data.requireEmailVerification || (!data.accessToken && requireVerification)) {
          setEmail(address)
          setVerification(true)
          setPassword('')
          setCode('')
          setCooldown(30)
          setFeedback({ type: 'info', message: 'Check your inbox for a verification code. Enter it below to finish creating your account.' })
        } else authenticate(data)
      } else if (mode === 'login') {
        authenticate(await request('signInWithPassword', { email: address, password }))
      } else if (mode === 'forgot-password') {
        await request('sendResetPasswordEmail', { email: address })
        if (!alive.current) return
        setResetRequested(true)
        setCooldown(30)
        setFeedback({ type: 'success', message: 'If an account matches that email, you’ll receive a reset code. Check your inbox and spam folder.' })
        onResetRequested?.(address)
      } else if (mode === 'reset-password') {
        let resetToken = null
        try {
          const exchange = await request('exchangeResetPasswordToken', { email: address, code })
          if (!alive.current) return
          resetToken = exchange.token
          if (typeof resetToken !== 'string' || !resetToken) throw new Error('The service did not return a reset confirmation. Request a new code and try again.')
          await request('resetPassword', { newPassword: password, otp: resetToken })
          if (!alive.current) return
          setPassword('')
          setConfirmation('')
          setCode('')
          setResetDone(true)
          setFeedback({ type: 'success', message: 'Your password was updated. Log in with your new password.' })
        } finally {
          resetToken = null
        }
      }
    }, verification ? 'verify' : mode)
  }

  function resend() {
    if (busy.current || cooldown > 0 || configIssue) return
    if (!verification) {
      const emailInput = formRef.current?.elements.namedItem('email')
      if (!email.trim() || emailInput?.validity.typeMismatch) {
        setErrors((current) => ({ ...current, email: 'Enter a valid email address to request a code.' }))
        emailInput?.focus()
        return
      }
    }
    void run('resend', async () => {
      await request(verification ? 'resendVerificationEmail' : 'sendResetPasswordEmail', { email: email.trim() })
      if (!alive.current) return
      setCode('')
      setErrors((current) => ({ ...current, code: '' }))
      setCooldown(30)
      setFeedback({ type: 'success', message: verification ? 'If this address needs verification, a new code has been requested. Check your inbox and spam folder.' : 'If an account matches that email, you’ll receive a new reset code. Check your inbox and spam folder.' })
    }, verification ? 'resend-verification' : 'forgot-password')
  }

  const headings = {
    login: ['Welcome back.', 'Log in to your release workspace.'],
    signup: ['Create your account.', 'Start a workspace, then connect a public GitHub repository.'],
    'forgot-password': ['Reset your password.', 'Enter your email to request a password reset code.'],
    'reset-password': ['Choose a new password.', 'Enter the code from your reset email. Codes are sent only if an account matches the requested email.'],
  }
  const [title, description] = resetDone ? ['Password updated.', 'Your new password is ready to use.'] : verification ? ['Verify your email.', 'Enter the 6-digit verification code from your email to finish signing in.'] : headings[mode] || headings.login
  const submitLabel = verification ? 'Verify email' : { login: 'Log in', signup: 'Create account', 'forgot-password': 'Send reset code', 'reset-password': 'Update password' }[mode]
  const pendingLabel = verification ? 'Verifying…' : { login: 'Logging in…', signup: 'Creating account…', 'forgot-password': 'Requesting code…', 'reset-password': 'Updating password…' }[mode]
  const emailId = `${id}-email`
  const codeId = `${id}-code`
  const feedbackId = `${id}-feedback`

  return (
    <div className="auth-page">
      <header className="auth-header pub-wrap">
        <Brand />
        <RouteLink className="auth-home-link" to="/" navigate={navigate} data-testid="auth-nav-home"><ArrowLeft size={16} aria-hidden="true" /> Back to home</RouteLink>
      </header>
      <main className={`auth-layout pub-wrap${mode === 'reset-password' ? ' auth-layout-reset' : ''}`} id="auth-main">
        <aside className="auth-context" aria-label="About Loopline">
          <span className="auth-context-icon" aria-hidden="true"><GitCommit size={32} /></span>
          <h2>Keep the evidence<br />close to the release.</h2>
          <p>One commit. Its actual GitHub checks. A clear place for your team to review what’s ready.</p>
          <div className="auth-context-note"><ShieldCheck size={19} aria-hidden="true" /><span>Public GitHub repositories.<br />Read-only access.</span></div>
        </aside>

          <section className="auth-card" data-mode={mode} data-state={configIssue ? 'unavailable' : resetDone ? 'complete' : verification ? 'verification' : pending ? 'pending' : feedback?.type || 'ready'} aria-labelledby={`${id}-title`}>
          <div className="auth-card-heading">
            <h1 id={`${id}-title`} ref={headingRef} tabIndex={-1}>{title}</h1>
            <p>{description}</p>
          </div>
          {configIssue && <div className="auth-message auth-message-error" role="alert" id={`${id}-unavailable`} data-testid="auth-unavailable"><strong>Email authentication unavailable</strong><p>{configIssue}</p></div>}
          {feedback && <div className={`auth-message auth-message-${feedback.type}`} id={feedbackId} role={feedback.type === 'error' ? 'alert' : 'status'} aria-live={feedback.type === 'error' ? 'assertive' : 'polite'} data-testid={feedback.type === 'error' ? 'auth-error' : 'auth-status'}>{feedback.type === 'success' && <CheckCircle size={18} aria-hidden="true" />}<p>{feedback.message}</p></div>}

          {resetDone ? <div className="auth-reset-complete" data-testid="auth-reset-success">
            <span aria-hidden="true"><Check size={27} weight="bold" /></span>
            <RouteLink className="auth-submit" to="/login" navigate={navigate} data-testid="auth-reset-login">Back to log in <ArrowRight size={17} aria-hidden="true" /></RouteLink>
          </div> : <>
            {verification && <div className="auth-verification-address"><span>{email.trim()}</span><button type="button" className="auth-text-button" disabled={Boolean(pending)} data-testid="auth-change-email" onClick={() => { setVerification(false); setCode(''); setErrors({}); setFeedback(null); setCooldown(0) }}>Change email</button></div>}
            <form className="auth-form" ref={formRef} onSubmit={handleSubmit} noValidate aria-busy={Boolean(pending)} aria-describedby={[feedback && feedbackId, configIssue && `${id}-unavailable`].filter(Boolean).join(' ') || undefined} data-testid="auth-form" data-mode={mode} data-step={verification ? 'verification' : mode}>
              <fieldset className="auth-fields" disabled={Boolean(pending)}>
                {!verification && <div className="auth-field">
                  <label htmlFor={emailId}>Email address</label>
                  <input className="auth-input" id={emailId} name="email" type="email" value={email} onChange={(event) => { changeField(setEmail, 'email', event.target.value); setResetRequested(false) }} autoComplete="email" autoCapitalize="none" spellCheck={false} required aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${emailId}-error` : undefined} data-testid="auth-email" />
                  {errors.email && <p className="auth-field-error" id={`${emailId}-error`}>{errors.email}</p>}
                </div>}
                {(verification || mode === 'reset-password') && <div className="auth-field">
                  <label htmlFor={codeId}>{verification ? 'Verification code' : 'Reset code'}</label>
                  <input className="auth-input auth-code-input" id={codeId} name="code" type="text" value={code} onChange={(event) => changeField(setCode, 'code', event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required aria-invalid={Boolean(errors.code)} aria-describedby={`${codeId}-hint${errors.code ? ` ${codeId}-error` : ''}`} data-testid={verification ? 'auth-verification-code' : 'auth-reset-code'} />
                  <p className="auth-field-hint" id={`${codeId}-hint`}>Enter all 6 digits. You can paste the code.</p>
                  {errors.code && <p className="auth-field-error" id={`${codeId}-error`}>{errors.code}</p>}
                </div>}
                {!verification && (mode === 'login' || mode === 'signup' || mode === 'reset-password') && <PasswordField id={`${id}-password`} name="password" label={mode === 'reset-password' ? 'New password' : 'Password'} value={password} onChange={(event) => changeField(setPassword, 'password', event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : newPasswordMinimum} error={errors.password} hint={mode === 'login' ? undefined : `Use at least ${newPasswordMinimum} characters.`} testId={mode === 'reset-password' ? 'auth-new-password' : 'auth-password'} />}
                {!verification && mode === 'reset-password' && <PasswordField id={`${id}-confirmation`} name="confirmation" label="Confirm new password" value={confirmation} onChange={(event) => changeField(setConfirmation, 'confirmation', event.target.value)} autoComplete="new-password" minLength={newPasswordMinimum} error={errors.confirmation} testId="auth-confirm-password" />}
              </fieldset>

              {!verification && mode === 'login' && <div className="auth-form-support"><RouteLink className="auth-inline-link" to="/forgot-password" navigate={navigate} data-testid="auth-forgot-link">Forgot password?</RouteLink></div>}
              <button className="auth-submit" type="submit" disabled={Boolean(pending || configIssue || (mode === 'forgot-password' && cooldown > 0))} aria-live="polite" data-testid={verification ? 'auth-verify-submit' : 'auth-submit'}>{pending === 'submit' ? pendingLabel : mode === 'forgot-password' && cooldown > 0 ? `Request again in ${cooldown}s` : submitLabel}{!pending && <ArrowRight size={17} aria-hidden="true" />}</button>

              {verification && <div className="auth-code-help"><p>Can’t find the email? Check your spam folder.</p><button className="auth-text-button" type="button" onClick={resend} disabled={Boolean(pending || configIssue || cooldown > 0)} data-testid="auth-resend-verification">{pending === 'resend' ? 'Requesting code…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend verification code'}</button></div>}
              {!verification && mode === 'reset-password' && <div className="auth-code-help"><p>Code missing or expired?</p><button className="auth-text-button" type="button" onClick={resend} disabled={Boolean(pending || configIssue || cooldown > 0)} data-testid="auth-resend-reset">{pending === 'resend' ? 'Requesting code…' : cooldown > 0 ? `Request code in ${cooldown}s` : 'Request a new reset code'}</button></div>}
              {!verification && mode === 'forgot-password' && <RouteLink className="auth-inline-link auth-code-link" to="/reset-password" navigate={navigate} data-testid={resetRequested ? 'auth-continue-reset' : 'auth-have-reset-code'}>{resetRequested ? 'Enter your reset code' : 'Already have a reset code?'} <ArrowRight size={15} aria-hidden="true" /></RouteLink>}
            </form>

            <div className="auth-card-footer">
              {mode === 'signup' ? <p>Already have an account? <RouteLink className="auth-inline-link" to="/login" navigate={navigate} data-testid="auth-nav-login">Log in</RouteLink></p> : mode === 'login' ? <p>New to Loopline? <RouteLink className="auth-inline-link" to="/signup" navigate={navigate} data-testid="auth-nav-signup">Create account</RouteLink></p> : <RouteLink className="auth-inline-link" to="/login" navigate={navigate} data-testid="auth-back-login"><ArrowLeft size={15} aria-hidden="true" /> Back to log in</RouteLink>}
            </div>
          </>}
          {mode === 'signup' && !verification && <p className="auth-account-note">Your account does not grant GitHub access. You choose a public repository after signing in.</p>}
        </section>
      </main>
      <footer className="auth-page-footer pub-wrap"><span>Loopline · Release readiness</span><a href={repositoryUrl} target="_blank" rel="noopener noreferrer" data-testid="auth-source-link">Project on GitHub <ArrowUpRight size={14} aria-hidden="true" /></a></footer>
    </div>
  )
}
