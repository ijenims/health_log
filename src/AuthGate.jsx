import { useEffect, useState } from 'react'
import { confirmSignIn, getCurrentUser, signIn, signOut } from 'aws-amplify/auth'
import { isAuthConfigured } from './authConfig'

const errorMessage = (error) => {
  if (error?.name === 'NotAuthorizedException') return 'メールアドレスまたはパスワードが正しくありません。'
  if (error?.name === 'UserNotFoundException') return 'メールアドレスまたはパスワードが正しくありません。'
  if (error?.name === 'PasswordResetRequiredException') return 'AWS側でパスワードの再設定が必要です。'
  if (error?.name === 'InvalidPasswordException') return '大文字・小文字・数字・記号を含む12文字以上で入力してください。'
  if (error?.name === 'LimitExceededException') return '試行回数が多すぎます。しばらく待ってから再試行してください。'
  return 'ログイン処理に失敗しました。時間をおいて再試行してください。'
}

export default function AuthGate({ children }) {
  const [status, setStatus] = useState(isAuthConfigured ? 'loading' : 'local')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isAuthConfigured) return
    getCurrentUser().then(() => setStatus('signed-in')).catch(() => setStatus('signed-out'))
  }, [])

  const completeSignIn = (result) => {
    if (result.isSignedIn) {
      setPassword('')
      setNewPassword('')
      setMessage('')
      setStatus('signed-in')
      return
    }
    if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
      setPassword('')
      setMessage('初回ログイン用の新しいパスワードを設定してください。')
      setStatus('new-password')
      return
    }
    throw new Error(`Unsupported sign-in step: ${result.nextStep?.signInStep}`)
  }

  const handleSignIn = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const submittedEmail = String(form.get('email') ?? '').trim()
    const submittedPassword = String(form.get('password') ?? '')
    setSubmitting(true)
    setMessage('')
    try {
      completeSignIn(await signIn({ username: submittedEmail, password: submittedPassword }))
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleNewPassword = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const submittedPassword = String(form.get('newPassword') ?? '')
    setSubmitting(true)
    try {
      completeSignIn(await confirmSignIn({ challengeResponse: submittedPassword }))
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    setEmail('')
    setStatus('signed-out')
  }

  if (status === 'local' || status === 'signed-in') return children({
    cloudEnabled: status === 'signed-in',
    onSignOut: status === 'signed-in' ? handleSignOut : null,
  })

  if (status === 'loading') {
    return <main className="auth-screen"><p className="auth-loading">ログイン状態を確認しています…</p></main>
  }

  const changingPassword = status === 'new-password'
  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><div className="brand-mark" aria-hidden="true"><span /></div><span>Health Log</span></div>
        <p className="auth-eyebrow">個人用 健診記録</p>
        <h1 id="auth-title">{changingPassword ? '新しいパスワードを設定' : 'ログイン'}</h1>
        <p className="auth-description">{changingPassword
          ? '今後のログインに使用するパスワードを入力してください。'
          : '登録済みのアカウントでログインしてください。'}</p>
        <form onSubmit={changingPassword ? handleNewPassword : handleSignIn}>
          {!changingPassword && <>
            <label>メールアドレス<input name="email" type="email" autoComplete="username" value={email}
              onChange={(event) => setEmail(event.target.value)} required autoFocus /></label>
            <label>パスワード<input name="password" type="password" autoComplete="current-password" value={password}
              onChange={(event) => setPassword(event.target.value)} required /></label>
          </>}
          {changingPassword && <label>新しいパスワード<input name="newPassword" type="password" autoComplete="new-password"
            value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength="12" required autoFocus />
            <small>12文字以上で、大文字・小文字・数字・記号を含めてください。</small></label>}
          {message && <p className={changingPassword ? 'auth-message info' : 'auth-message'} role="alert">{message}</p>}
          <button type="submit" disabled={submitting}>{submitting ? '処理中…' : changingPassword ? '設定してログイン' : 'ログイン'}</button>
        </form>
      </section>
    </main>
  )
}
