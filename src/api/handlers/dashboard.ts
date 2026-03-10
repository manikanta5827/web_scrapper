export async function handleDashboard(req: Request, url: URL): Promise<Response> {
  const rootId = url.pathname.split('/').pop() || '';
  try {
    const file = Bun.file('src/api/dashboard.html');
    let html = await file.text();
    if(!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return new Response('Supabase configuration is missing', { status: 500 });
    }

    // Inject dynamic values
    html = html.replaceAll('{{rootId}}', rootId);
    html = html.replaceAll('{{supabaseUrl}}', process.env.SUPABASE_URL || '');
    html = html.replaceAll('{{supabaseAnonKey}}', process.env.SUPABASE_ANON_KEY || '');
    
    return new Response(html, { 
      headers: { 'Content-Type': 'text/html' } 
    });
  } catch (e) {
    return new Response('Dashboard template not found', { status: 404 });
  }
}
