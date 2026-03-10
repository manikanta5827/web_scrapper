export async function handleDashboard(req: Request, url: URL): Promise<Response> {
  // Check if we have a specific ID, e.g., /dashboard/123
  const pathParts = url.pathname.split('/').filter(p => p !== '');
  const isDetailView = pathParts.length > 1; // [dashboard, 123] vs [dashboard]
  const rootId = isDetailView ? pathParts[1] : '';

  try {
    const fileName = isDetailView ? 'src/api/dashboard.html' : 'src/api/index.html';
    const file = Bun.file(fileName);
    let html = await file.text();
    
    // Inject dynamic values
    html = html.replaceAll('{{rootId}}', rootId || '');
    html = html.replaceAll('{{supabaseUrl}}', process.env.SUPABASE_URL || '');
    html = html.replaceAll('{{supabaseAnonKey}}', process.env.SUPABASE_ANON_KEY || '');
    
    return new Response(html, { 
      headers: { 'Content-Type': 'text/html' } 
    });
  } catch (e) {
    return new Response(`Template not found: ${isDetailView ? 'detail' : 'index'}`, { status: 404 });
  }
}
