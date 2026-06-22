import "./globals.css";

export const metadata = {
  title: "Microscope Stepper Control",
  description: "Local LAN dashboard for Raspberry Pi microscope automation.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
