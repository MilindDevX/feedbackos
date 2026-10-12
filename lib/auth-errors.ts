// Plain-language messages for the error codes Auth.js appends to /login?error=…
export function signInErrorMessage(code: string | undefined): string {
  if (!code) return ''
  switch (code) {
    case 'Verification':
      return 'That sign-in link has expired or was already used. Enter your email to get a new one.'
    case 'OAuthAccountNotLinked':
      return 'This email is already linked to another sign-in method. Use the magic link instead.'
    case 'AccessDenied':
      return 'Sign-in was cancelled or not allowed for this account.'
    case 'EmailSignin':
      return 'We couldn’t send the sign-in email right now. Please try again in a moment.'
    default:
      return 'Sign-in didn’t work. Please try again.'
  }
}
