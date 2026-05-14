'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '../../utils/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()
  
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // WE CHANGED THIS to show the actual error message!
  if (error) {
    console.error("LOGIN ERROR:", error.message)
    redirect(`/login?message=${error.message}`)
  }

  revalidatePath('/')
  redirect('/')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()
  
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('fullName') as string

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      }
    }
  })

  // WE CHANGED THIS to show the actual error message!
  if (error) {
    console.error("SIGNUP ERROR:", error.message)
    redirect(`/login?message=${error.message}`)
  }

  revalidatePath('/')
  redirect('/')
}