import "./globals.css";
import { ToastProvider } from "../components/ui/StatusToast";

export const metadata = {
  title: "Microscope Stepper Control",
  description: "Local LAN dashboard for Raspberry Pi microscope automation.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
