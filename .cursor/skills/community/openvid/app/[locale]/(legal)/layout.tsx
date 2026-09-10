import Footer from "@/app/components/common/Footer";
import Header from "@/app/components/common/Header";
import { AuthProvider } from "@/app/contexts/useAuth";
import { RecordingProvider } from "@/app/contexts/RecordingContext";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
  },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <RecordingProvider>
                <div className="min-h-screen flex flex-col bg-[#09090B] dark">
                    <Header />
                    <div className="grow pt-24 pb-16">
                        {children}
                    </div>
                    <Footer />
                </div>
            </RecordingProvider>
        </AuthProvider>
    );
}
