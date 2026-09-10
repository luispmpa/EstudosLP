import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(
  url && key && !url.includes("your-project") && key !== "your-publishable-key",
);
export const supabase = configured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

function client() {
  if (!supabase)
    throw new Error(
      "Configure o endereço e a chave pública do Supabase para conectar seus estudos.",
    );
  return supabase;
}
export const auth = {
  signIn: (email: string, password: string) =>
    client().auth.signInWithPassword({ email, password }),
  signUp: (email: string, password: string) =>
    client().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    }),
  signOut: () => client().auth.signOut(),
  resetPassword: (email: string) =>
    client().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/?recovery=1",
    }),
  updatePassword: (password: string) => client().auth.updateUser({ password }),
  getSession: () => client().auth.getSession(),
};
