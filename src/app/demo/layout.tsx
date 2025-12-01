import { Metadata } from 'next';
import { Providers } from '@/app/Providers';

export default function DemoRootLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}

export const metadata: Metadata = {
  title: {
    template: '%s | First8Marketing Demo',
    default: 'First8Marketing Analytics Demo',
  },
  description: 'Explore First8Marketing analytics platform capabilities with our interactive demo.',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'First8Marketing Analytics Demo',
    description:
      'Explore powerful analytics, email tracking, and WhatsApp integration capabilities.',
    type: 'website',
  },
};
