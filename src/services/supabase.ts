/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';

// Load Supabase environment variables
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

// Initialize Supabase Client with fallbacks to avoid compilation and loader crashes if not defined
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);

export const isSupabaseConfigured = !!(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://placeholder-project.supabase.co'
);

/**
 * Validates connection to Supabase according to guidelines
 */
export async function testSupabaseConnection(): Promise<boolean> {
  if (!isSupabaseConfigured) {
    console.warn("Supabase is not configured yet. Working in local sandbox mode.");
    return false;
  }
  try {
    const { error } = await supabase.from('vault_entries').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      console.warn("Supabase check error (this is normal if tables are not created yet):", error.message);
    } else {
      console.log("Supabase connection verified successfully.");
    }
    return true;
  } catch (error) {
    console.error("Supabase connection failed:", error);
    return false;
  }
}

// Run connectivity check silently
testSupabaseConnection();
