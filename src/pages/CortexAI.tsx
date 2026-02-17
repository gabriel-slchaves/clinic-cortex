import { Bot } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useAppEntryGate } from "@/hooks/useAppEntryGate";
import { Skeleton } from "@/components/ui/skeleton";
import Step6AiConfig from "@/pages/onboarding/Step6AiConfig";

function ErrorPanel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="min-h-screen bg-[#E9FDF4] text-[#002115] px-5 md:px-12 py-10 md:py-14">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-[2rem] border border-[#025940]/[0.10] shadow-[0_24px_60px_-35px_rgba(2,89,64,0.25)] overflow-hidden">
          <div className="relative px-7 md:px-10 py-8 md:py-10">
            <div className="absolute -top-12 -right-8 h-36 w-36 rounded-full bg-[#23D996]/10 blur-3xl" />
            <div className="absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-[#062B1D]/[0.05] blur-3xl" />

            <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] border border-red-100 bg-red-50 text-red-500">
                <Bot className="h-8 w-8" strokeWidth={2.1} />
              </div>

              <div className="min-w-0">
                <div className="text-[11px] font-900 uppercase tracking-[0.24em] text-[#118C5F] font-['Space_Grotesk']">
                  CortexAI
                </div>
                <h1 className="mt-2 text-3xl md:text-4xl font-['Syne'] font-800 text-[#003F2D] tracking-tight">
                  {title}
                </h1>
                <p className="mt-3 max-w-2xl text-[15px] md:text-[17px] leading-relaxed text-[#3F4944] font-['Space_Grotesk'] font-600 opacity-80">
                  {subtitle}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CortexAISkeleton() {
  return (
    <div className="min-h-screen bg-[#E9FDF4] text-[#002115] px-5 md:px-12 py-10 md:py-14">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="bg-white rounded-[2rem] border border-[#025940]/[0.10] shadow-[0_24px_60px_-35px_rgba(2,89,64,0.25)] overflow-hidden p-8 md:p-10 space-y-5">
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-12 w-96 max-w-full rounded-2xl" />
          <Skeleton className="h-5 w-[32rem] max-w-full rounded-full" />
          <Skeleton className="h-5 w-[26rem] max-w-full rounded-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10">
          <div className="lg:col-span-8 bg-white rounded-[2rem] border border-[#025940]/[0.10] shadow-[0_24px_60px_-35px_rgba(2,89,64,0.25)] p-6 md:p-8 space-y-5">
            <Skeleton className="h-8 w-48 rounded-2xl" />
            <Skeleton className="h-[420px] w-full rounded-[1.75rem]" />
          </div>
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-[2rem] border border-[#025940]/[0.10] shadow-[0_24px_60px_-35px_rgba(2,89,64,0.25)] p-6 space-y-4">
              <Skeleton className="h-6 w-40 rounded-xl" />
              <Skeleton className="h-24 w-full rounded-[1.5rem]" />
              <Skeleton className="h-10 w-full rounded-2xl" />
            </div>
            <div className="bg-white rounded-[2rem] border border-[#025940]/[0.10] shadow-[0_24px_60px_-35px_rgba(2,89,64,0.25)] p-6 space-y-4">
              <Skeleton className="h-6 w-32 rounded-xl" />
              <Skeleton className="h-40 w-full rounded-[1.5rem]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CortexAI() {
  const { user } = useAuth();
  const entryQuery = useAppEntryGate(user?.id || null);
  const clinicId = String(entryQuery.data?.clinicId || "").trim() || null;

  if (entryQuery.isLoading && !entryQuery.data) {
    return <CortexAISkeleton />;
  }

  if (entryQuery.error || !clinicId) {
    return (
      <ErrorPanel
        title="Não foi possível abrir a CortexAI"
        subtitle={
          entryQuery.error
            ? "Não foi possível carregar a configuração da CortexAI agora. Tente novamente em instantes."
            : clinicId
            ? "A configuração da CortexAI não pôde ser carregada para esta conta."
            : "Nenhuma clínica vinculada à sua conta foi encontrada para abrir a configuração da IA."
        }
      />
    );
  }

  return <Step6AiConfig clinicId={clinicId} mode="app" />;
}
