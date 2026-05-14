import { login, signup } from './actions'

export default async function LoginPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams
  const message = searchParams.message as string | undefined

  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 mx-auto min-h-screen">
      <h1 className="text-2xl font-bold text-center mb-6">Incident Tracker Auth</h1>
      <form className="flex-1 flex flex-col w-full justify-center gap-2 text-foreground">
        
        <label className="text-md font-medium" htmlFor="fullName">Full Name (For Signup Only)</label>
        <input
          className="rounded-md px-4 py-2 bg-inherit border mb-6"
          name="fullName"
          placeholder="John Doe"
        />

        <label className="text-md font-medium" htmlFor="email">Email</label>
        <input
          className="rounded-md px-4 py-2 bg-inherit border mb-6"
          name="email"
          placeholder="you@example.com"
          required
        />

        <label className="text-md font-medium" htmlFor="password">Password</label>
        <input
          className="rounded-md px-4 py-2 bg-inherit border mb-6"
          type="password"
          name="password"
          placeholder="••••••••"
          required
        />

        <button formAction={login} className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 mb-2">
          Sign In
        </button>
        <button formAction={signup} className="border border-foreground/20 hover:bg-gray-100 rounded-md px-4 py-2 mb-2">
          Sign Up
        </button>

        {message && (
          <p className="mt-4 p-4 bg-red-100 text-red-600 text-center rounded-md">
            {message}
          </p>
        )}
      </form>
    </div>
  )
}