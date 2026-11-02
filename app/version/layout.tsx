import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Teams Shifts - Version Control & Updates',
  description: 'Version Control, Release Notes & Software Updates Hub for Teams Shifts',
};

export default function VersionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
