// Mock Supabase client for build time
export const createMockClient = () => ({
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: (callback: any) => {
      // Call callback immediately with null session for build time
      setTimeout(() => callback('SIGNED_OUT', null), 0);
      return { 
        data: { 
          subscription: { 
            unsubscribe: () => {} 
          } 
        } 
      };
    },
    signInWithPassword: () => Promise.resolve({ 
      data: { user: null, session: null }, 
      error: new Error('Supabase not configured') 
    }),
    signUp: () => Promise.resolve({ 
      data: { user: null, session: null }, 
      error: new Error('Supabase not configured') 
    }),
    signOut: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: () => Promise.resolve({ 
      error: new Error('Supabase not configured') 
    }),
    exchangeCodeForSession: () => Promise.resolve({ 
      data: { session: null }, 
      error: null 
    }),
  },
  from: (table: string) => ({
    select: (columns?: string) => ({
      eq: (column: string, value: any) => ({
        order: (column: string, options?: any) => ({
          limit: (count: number) => Promise.resolve({ data: [], error: null }),
        }),
        single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
      }),
      single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
    }),
    insert: (data: any) => ({
      select: (columns?: string) => ({
        single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
      }),
    }),
    update: (data: any) => ({
      eq: (column: string, value: any) => ({
        select: (columns?: string) => ({
          single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
        }),
      }),
    }),
    delete: () => ({
      eq: (column: string, value: any) => Promise.resolve({ error: null }),
    }),
    upsert: (data: any, options?: any) => ({
      select: (columns?: string) => ({
        single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
      }),
    }),
  }),
  channel: (name: string) => ({
    on: (event: string, filter: any, callback: any) => ({
      subscribe: () => Promise.resolve({ error: null }),
    }),
  }),
});