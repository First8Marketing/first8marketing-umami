# Demo Mode Feature Specification

## Overview
Implement a configurable Demo Mode for First8Marketing-umami that provides a public showcase of the analytics dashboard, email tracking, and WhatsApp integration capabilities without exposing administrative access.

## Objectives
1. **Public Demonstration** - Allow visitors to explore the platform capabilities
2. **Lead Generation** - Display contact information (email/WhatsApp) prominently
3. **Security** - Prevent any administrative access or data modification
4. **Configurability** - Enable/disable via environment variables

## Environment Variables

```bash
# Demo Mode Configuration
DEMO_MODE=false                          # Enable/disable demo mode (default: false)
DEMO_WEBSITE_ID=                         # UUID of website to display in demo
DEMO_SHARE_ID=                           # Optional: Use existing share token
DEMO_EMAIL=contact@example.com           # Contact email displayed in demo
DEMO_WHATSAPP=+1234567890                # WhatsApp number for demo contact
DEMO_BRAND_NAME=First8Marketing          # Brand name shown in header
DEMO_CTA_TEXT=Schedule a Demo            # Call-to-action button text
DEMO_CTA_URL=https://calendly.com/...    # CTA URL for demo booking
```

## Architecture

### Route Structure
```
/                    → Demo landing page (when DEMO_MODE=true)
/demo                → Alternative demo entry point
/login               → Blocked when DEMO_MODE=true (403)
/admin/*             → Blocked when DEMO_MODE=true (403)
/settings/*          → Blocked when DEMO_MODE=true (403)
/share/[shareId]     → Existing share functionality (unchanged)
```

### Component Hierarchy
```
DemoLayout
├── DemoHeader
│   ├── Logo/Brand
│   ├── ThemeToggle
│   ├── LanguageSelector
│   └── ContactCTA
├── DemoContactBanner
│   ├── EmailButton
│   └── WhatsAppButton
├── DemoContent
│   ├── WebsitePage (read-only dashboard)
│   ├── DemoFeatureShowcase
│   └── DemoWhatsAppPreview
└── DemoFooter
    ├── ContactInfo
    ├── CTA Button
    └── Version Info
```

### Data Flow
1. **Initial Load**: Check `DEMO_MODE` env var
2. **Website Data**: Fetch from `DEMO_WEBSITE_ID` or `DEMO_SHARE_ID`
3. **Analytics API**: Use read-only endpoints with demo context
4. **Contact Info**: Display from environment variables

## Security Considerations

### Protected Routes (403 in Demo Mode)
- `/login` - Prevent login attempts
- `/admin/*` - Block all admin routes
- `/settings/*` - Block settings pages
- `/api/admin/*` - Block admin API endpoints
- `/api/auth/*` - Block auth endpoints (except verify for demo)

### API Restrictions
- All write operations return 403
- Only configured website data accessible
- Rate limiting applied to demo endpoints
- No user context exposed

### Middleware Logic
```typescript
// Demo mode route protection
if (isDemoMode) {
  if (isAdminRoute || isSettingsRoute || isLoginRoute) {
    return 403 Forbidden
  }
  if (isWriteOperation) {
    return 403 Forbidden
  }
}
```

## Implementation Plan

### Phase 1: Configuration Setup
- [ ] Add demo mode env vars to `.env.example`
- [ ] Update `next.config.ts` to expose demo variables
- [ ] Create demo configuration constants

### Phase 2: Core Components
- [ ] Create `DemoProvider` context
- [ ] Create `DemoHeader` component
- [ ] Create `DemoFooter` component  
- [ ] Create `DemoContactBanner` component
- [ ] Create `DemoLayout` wrapper

### Phase 3: Demo Pages
- [ ] Create `/demo/page.tsx` entry point
- [ ] Modify root page for demo mode redirect
- [ ] Create demo-specific dashboard view

### Phase 4: Middleware & Security
- [ ] Update middleware for demo route protection
- [ ] Add API route guards for demo mode
- [ ] Implement read-only API wrapper

### Phase 5: Integration
- [ ] Test all demo features end-to-end
- [ ] Verify security restrictions
- [ ] Performance testing

### Phase 6: Documentation
- [ ] Update README with demo mode instructions
- [ ] Create deployment guide
- [ ] Document configuration options

## UI/UX Requirements

### Demo Header
- First8Marketing logo (configurable)
- Theme toggle
- Language selector
- "Contact Us" or "Schedule Demo" CTA button

### Contact Banner (Fixed Position)
- Floating banner at bottom or side
- Email icon with mailto link
- WhatsApp icon with click-to-chat link
- Pulse animation to attract attention

### Demo Dashboard
- Full analytics dashboard view
- Read-only interactions
- Tooltips explaining features
- "This is a demo" watermark (optional)

### Footer
- Contact information
- Links to pricing/features pages
- Version number
- Powered by First8Marketing

## Testing Checklist

- [ ] Demo mode enables via DEMO_MODE=true
- [ ] Dashboard displays correct website data
- [ ] Email link opens email client
- [ ] WhatsApp link opens WhatsApp
- [ ] Login page returns 403
- [ ] Admin routes return 403
- [ ] Settings routes return 403
- [ ] Write API calls return 403
- [ ] Theme switching works
- [ ] Language switching works
- [ ] Responsive design works
- [ ] CTA buttons function correctly

## Success Criteria

1. Visitors can explore analytics dashboard without authentication
2. Contact information is prominently displayed
3. No administrative access possible
4. Configuration via environment variables only
5. Existing functionality unaffected when demo mode is disabled