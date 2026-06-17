import Link from 'next/link'
import { requestPasswordReset } from './actions'

export default async function ForgotPasswordPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams
  const message = searchParams.message as string | undefined
  const success = searchParams.success === '1'

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

        <form className="flex flex-col gap-5">
          <div>
            <label className="app-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="app-input"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              formAction={requestPasswordReset}
              type="submit"
              className="app-btn-primary w-full py-2.5"
            >
              Send reset link
            </button>
          </div>

          {success && (
            <p
              role="status"
              className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-center text-sm font-medium text-green-800"
            >
              If an account exists for that email, you&apos;ll receive a reset link shortly.
            </p>
          )}

          {message && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-800"
            >
              {message}
            </p>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600">
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
