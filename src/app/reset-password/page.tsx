import { resetPassword } from './actions'

export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams
  const message = searchParams.message as string | undefined

  return (
    <div className="app-page flex flex-1 items-center justify-center px-4 py-12">
      <div className="app-card w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Choose a new password
          </h1>
          <p className="mt-2 text-sm text-zinc-600">Enter your new password below</p>
        </div>

        <form className="flex flex-col gap-5">
          <div>
            <label className="app-label" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              className="app-input"
              type="password"
              name="password"
              placeholder="••••••••"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          <div>
            <label className="app-label" htmlFor="confirmPassword">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              className="app-input"
              type="password"
              name="confirmPassword"
              placeholder="••••••••"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button formAction={resetPassword} type="submit" className="app-btn-primary w-full py-2.5">
              Update password
            </button>
          </div>

          {message && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-800"
            >
              {message}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
