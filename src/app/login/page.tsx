import { login, signup } from './actions'

export default async function LoginPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams
  const message = searchParams.message as string | undefined

  return (
    <div className="app-page flex flex-1 items-center justify-center px-4 py-12">
      <div className="app-card w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Incident Tracker
          </h1>
          <p className="mt-2 text-sm text-zinc-600">Sign in to manage cases</p>
        </div>

        <form className="flex flex-col gap-5">
          <div>
            <label className="app-label" htmlFor="fullName">
              Full name <span className="normal-case font-normal text-zinc-500">(signup only)</span>
            </label>
            <input
              id="fullName"
              className="app-input"
              name="fullName"
              placeholder="John Doe"
              autoComplete="name"
            />
          </div>

          <div>
            <label className="app-label" htmlFor="email">Email</label>
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

          <div>
            <label className="app-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="app-input"
              type="password"
              name="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button formAction={login} type="submit" className="app-btn-primary w-full py-2.5">
              Sign in
            </button>
            <button formAction={signup} type="submit" className="app-btn-secondary w-full py-2.5">
              Create account
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
