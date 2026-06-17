import { ForgotPasswordForm } from './ForgotPasswordForm'

export default function ForgotPasswordPage() {
  return (
    <div className="app-page flex flex-1 items-center justify-center px-4 py-12">
      <div className="app-card w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        <ForgotPasswordForm />
      </div>
    </div>
  )
}
