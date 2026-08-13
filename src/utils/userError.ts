const ERROR_MESSAGES: Array<[RegExp, string]> = [
  [/auth\/(invalid-credential|user-not-found)|invalid credentials?/i, 'No account was found with these details.'],
  [/auth\/wrong-password|incorrect password/i, 'The password is incorrect.'],
  [/auth\/email-already-in-use|already registered/i, 'This email is already registered.'],
  [/auth\/weak-password|password.*(6|weak)/i, 'Use a password with at least 6 characters.'],
  [/auth\/invalid-email/i, 'Enter a valid email address.'],
  [/auth\/too-many-requests|too many.*attempt/i, 'Too many attempts. Please try again later.'],
  [/auth\/network-request-failed|failed to fetch|load failed|network/i, 'Connection failed. Check your internet and try again.'],
  [/auth\/popup-blocked/i, 'Allow pop-ups to continue with Google.'],
  [/auth\/popup-closed-by-user/i, 'Google sign-in was cancelled.'],
  [/auth\/account-exists-with-different-credential/i, 'This email uses a different sign-in method.'],
  [/operation-not-allowed/i, 'This sign-in method is currently unavailable.'],
  [/email.*not.*verif|verify your email/i, 'Verify your email before signing in.'],
  [/incorrect verification code|incorrect.*otp/i, 'The verification code is incorrect.'],
  [/code has expired|expired.*code/i, 'The code has expired. Request a new one.'],
  [/wait \d+ seconds/i, 'Please wait before requesting another code.'],
  [/insufficient.*(fund|balance|float)/i, 'The available balance is not enough.'],
  [/access denied|unauthorized|permission/i, 'You do not have permission to do this.'],
  [/quota|resource_exhausted/i, 'The service is temporarily busy. Please try again later.'],
  [/promo code.*(invalid|expired)|invalid.*promo/i, 'The promo code is invalid or expired.'],
  [/server-ku api json|unexpected token|<!doctype/i, 'The service is temporarily unavailable. Please try again.'],
];

export function userErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const raw = typeof error === 'string'
    ? error
    : error && typeof error === 'object'
      ? String((error as any).code || (error as any).message || '')
      : '';
  for (const [pattern, message] of ERROR_MESSAGES) if (pattern.test(raw)) return message;
  return fallback;
}
