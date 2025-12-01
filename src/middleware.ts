import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: '/:path*',
};

const TRACKER_PATH = '/script.js';
const COLLECT_PATH = '/api/send';
const LOGIN_PATH = '/login';
const DEMO_PATH = '/demo';

// Routes that are blocked in demo mode to prevent admin access
const DEMO_BLOCKED_ROUTES = [
  '/login',
  '/logout',
  '/settings',
  '/dashboard',
  '/teams',
  '/websites',
  '/reports',
  '/users',
  '/admin',
  '/api/auth',
  '/api/users',
  '/api/teams',
  '/api/admin',
];

// Routes that are always allowed in demo mode
const DEMO_ALLOWED_ROUTES = [
  '/demo',
  '/share',
  '/script.js',
  '/api/send',
  '/api/websites',
  '/_next',
  '/favicon.ico',
  '/images',
  '/fonts',
];

const apiHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, POST, PUT',
  'Access-Control-Max-Age': process.env.CORS_MAX_AGE || '86400',
  'Cache-Control': 'no-cache',
};

const trackerHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=86400, must-revalidate',
};

function customCollectEndpoint(request: NextRequest) {
  const collectEndpoint = process.env.COLLECT_API_ENDPOINT;

  if (collectEndpoint) {
    const url = request.nextUrl.clone();

    if (url.pathname.endsWith(collectEndpoint)) {
      url.pathname = COLLECT_PATH;
      return NextResponse.rewrite(url, { headers: apiHeaders });
    }
  }
}

function customScriptName(request: NextRequest) {
  const scriptName = process.env.TRACKER_SCRIPT_NAME;

  if (scriptName) {
    const url = request.nextUrl.clone();
    const names = scriptName.split(',').map(name => name.trim().replace(/^\/+/, ''));

    if (names.find(name => url.pathname.endsWith(name))) {
      url.pathname = TRACKER_PATH;
      return NextResponse.rewrite(url, { headers: trackerHeaders });
    }
  }
}

function customScriptUrl(request: NextRequest) {
  const scriptUrl = process.env.TRACKER_SCRIPT_URL;

  if (scriptUrl && request.nextUrl.pathname.endsWith(TRACKER_PATH)) {
    return NextResponse.rewrite(scriptUrl, { headers: trackerHeaders });
  }
}

function disableLogin(request: NextRequest) {
  const loginDisabled = process.env.DISABLE_LOGIN;

  if (loginDisabled && request.nextUrl.pathname.endsWith(LOGIN_PATH)) {
    return new NextResponse('Access denied', { status: 403 });
  }
}

/**
 * Demo mode middleware handler
 * - Redirects root path to /demo when DEMO_MODE is enabled
 * - Blocks admin routes to prevent unauthorized access
 * - Allows public demo page and necessary assets
 */
function handleDemoMode(request: NextRequest) {
  const demoMode = process.env.DEMO_MODE === 'true';

  if (!demoMode) {
    return undefined;
  }

  const pathname = request.nextUrl.pathname;
  const url = request.nextUrl.clone();

  // Check if route is explicitly allowed in demo mode
  const isAllowedRoute = DEMO_ALLOWED_ROUTES.some(
    route => pathname === route || pathname.startsWith(route + '/'),
  );

  if (isAllowedRoute) {
    return undefined; // Allow the request to proceed
  }

  // Redirect root to demo page
  if (pathname === '/') {
    url.pathname = DEMO_PATH;
    return NextResponse.redirect(url);
  }

  // Block admin/protected routes in demo mode
  const isBlockedRoute = DEMO_BLOCKED_ROUTES.some(
    route => pathname === route || pathname.startsWith(route + '/'),
  );

  if (isBlockedRoute) {
    // Return 403 with helpful message for demo mode
    return new NextResponse(
      JSON.stringify({
        error: 'Demo Mode',
        message:
          'This route is not accessible in demo mode. Visit /demo to explore the analytics dashboard.',
        demoUrl: '/demo',
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }

  return undefined;
}

export default function middleware(req: NextRequest) {
  // Demo mode handler takes priority to ensure security
  const demoResponse = handleDemoMode(req);
  if (demoResponse) {
    return demoResponse;
  }

  const fns = [customCollectEndpoint, customScriptName, customScriptUrl, disableLogin];

  for (const fn of fns) {
    const res = fn(req);
    if (res) {
      return res;
    }
  }

  return NextResponse.next();
}
