/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4; // 0: Weak, 1: Fair, 2: Good, 3: Strong, 4: Excellent
  label: 'Weak' | 'Fair' | 'Good' | 'Strong' | 'Excellent';
  entropy: number; // Bits of entropy
  suggestions: string[];
  diversityScore: number; // Count of unique character types (0-4)
}

// Top 50 common passwords to flag instantly
const COMMON_PASSWORDS = new Set([
  '123456', 'password', '123456789', '12345678', '12345', 'qwerty', '1234567', 'google', 
  'letmein', 'password123', 'admin', 'football', 'welcome', 'superman', '123123', 'monkey',
  'shadow', 'iloveyou', 'sunshine', 'princess', 'charlie', 'killer', 'ginger', 'hunter2',
  'admin123', 'qwerty123', 'password11', 'secret', 'pass123', 'passwords', 'user123',
  'abc123', 'changeit', 'login', 'default', 'master', 'security', 'key123', 'admin@123'
]);

/**
 * Calculates Shannon entropy of a password and performs comprehensive security checks.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return {
      score: 0,
      label: 'Weak',
      entropy: 0,
      suggestions: ['Please enter a password.'],
      diversityScore: 0
    };
  }

  const length = password.length;
  const suggestions: string[] = [];

  // 1. Check for common passwords
  const normalized = password.toLowerCase().trim();
  if (COMMON_PASSWORDS.has(normalized)) {
    return {
      score: 0,
      label: 'Weak',
      entropy: 5, // Arbitrary low level
      suggestions: ['This is an extremely common password that is easily guessed or brute-forced. Crucially avoid this.'],
      diversityScore: 1
    };
  }

  // 2. Character diversity checks
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  let poolSize = 0;
  let diversityScore = 0;
  if (hasLower) { poolSize += 26; diversityScore++; }
  if (hasUpper) { poolSize += 26; diversityScore++; }
  if (hasDigit) { poolSize += 10; diversityScore++; }
  if (hasSymbol) { poolSize += 33; diversityScore++; } // Approx standard symbols pool

  // 3. Shannon Entropy calculation
  // Entropy H = L * log2(PoolSize)
  const entropy = length > 0 && poolSize > 0 ? Math.round(length * Math.log2(poolSize)) : 0;

  // 4. Generate security critiques and suggestions
  if (length < 8) {
    suggestions.push('Make the password longer. Aim for at least 12-16 characters.');
  } else if (length < 12) {
    suggestions.push('Increasing length beyond 12 characters exponentially boosts guessing difficulty.');
  }

  if (!hasUpper) suggestions.push('Add uppercase letters (A-Z) to increase diversity.');
  if (!hasLower) suggestions.push('Add lowercase letters (a-z).');
  if (!hasDigit) suggestions.push('Add numerical digits (0-9).');
  if (!hasSymbol) suggestions.push('Add special characters or punctuation symbols (e.g., @, #, $, %).');

  // Check repetition or sequential characters
  if (/(.)\1\1/.test(password)) {
    suggestions.push('Avoid repeating identical characters 3 or more times (e.g., "aaa").');
  }

  // 5. Determine Overall Score based on length, diversity, and entropy
  let score: 0 | 1 | 2 | 3 | 4 = 0;
  let label: 'Weak' | 'Fair' | 'Good' | 'Strong' | 'Excellent' = 'Weak';

  if (length >= 14 && diversityScore >= 3 && entropy >= 60) {
    score = 4;
    label = 'Excellent';
  } else if (length >= 10 && diversityScore >= 3 && entropy >= 45) {
    score = 3;
    label = 'Strong';
  } else if (length >= 8 && diversityScore >= 2 && entropy >= 30) {
    score = 2;
    label = 'Good';
  } else if (length >= 6 && entropy >= 18) {
    score = 1;
    label = 'Fair';
  } else {
    score = 0;
    label = 'Weak';
  }

  // If score is Excellent, give positive feedback
  if (score === 4 && suggestions.length === 0) {
    suggestions.push('This is a highly complex, robust password. Keep it safe!');
  }

  return {
    score,
    label,
    entropy,
    suggestions,
    diversityScore
  };
}
