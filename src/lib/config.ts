// Configuration publique de l'appli. Seules des valeurs NON secrètes peuvent être en EXPO_PUBLIC_* :
// elles sont intégrées au binaire. Les secrets des prestataires bancaires vivent côté serveur uniquement.

export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  appEnv: (process.env.EXPO_PUBLIC_APP_ENV ?? 'development') as 'development' | 'production',
};

export const isSupabaseConfigured = (): boolean => !!config.supabaseUrl && !!config.supabaseKey;
