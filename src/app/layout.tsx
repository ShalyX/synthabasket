import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { WalletContextProvider } from '../components/WalletContextProvider';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'SynthaBasket | Solana Tokenized Pre-IPO Index Protocol',
  description:
    '1-click thematic index baskets for tokenized private-market assets on Solana, with live provider marks from PreStocks and Tessera, on-chain basket custody, and benchmark or liquidity integrations only when available.',
};

const themeBootScript = `
  (function () {
    try {
      var saved = localStorage.getItem('synthabasket-theme');
      var dark = saved ? saved === 'dark' : true;
      document.documentElement.classList.toggle('dark', dark);
    } catch (error) {
      document.documentElement.classList.add('dark');
    }
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-background text-ink-primary min-h-screen flex flex-col antialiased`}>
        <WalletContextProvider>{children}</WalletContextProvider>
      </body>
    </html>
  );
}
