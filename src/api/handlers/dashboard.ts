export async function handleDashboard(req: Request, url: URL): Promise<Response> {
  const rootId = url.pathname.split('/').pop() || '';
  try {
    const file = Bun.file('src/api/dashboard.html');
    const html = await file.text();
    const finalHtml = html.replaceAll('{{rootId}}', rootId);
    
    return new Response(finalHtml, { 
      headers: { 'Content-Type': 'text/html' } 
    });
  } catch (e) {
    return new Response('Dashboard template not found', { status: 404 });
  }
}
