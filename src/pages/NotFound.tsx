import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] px-4">
      <Card className="w-full max-w-lg shadow-lg border border-[var(--cc-border)] bg-[var(--cc-bg-white)] backdrop-blur-sm">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-red-100 rounded-full animate-pulse" />
              <AlertCircle className="relative h-16 w-16 text-red-500" />
            </div>
          </div>

          <h1 className="text-4xl font-900 text-[var(--cc-text-primary)] mb-2 font-['Syne']">404</h1>

          <h2 className="text-xl font-800 text-[var(--cc-text-muted)] mb-4 font-['Space_Grotesk']">
            Página não encontrada
          </h2>

          <p className="text-[var(--cc-text-muted)] mb-8 leading-relaxed font-['Space_Grotesk'] opacity-80">
            A página que você tentou acessar não existe.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={handleGoHome}
              className="cc-btn-primary px-6 py-2.5 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
            >
              <Home className="w-4 h-4 mr-2" />
              Ir para início
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
