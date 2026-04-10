import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppEntryGate } from "@/hooks/useAppEntryGate";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { useEffect, useRef } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { isAppHostname, navigateToAppPath } from "@/lib/appOrigin";
import AppShell from "@/components/app/AppShell";
import ThemeSessionSync from "@/components/app/ThemeSessionSync";
import Dashboard from "./pages/Dashboard";
import AuthCallback from "./pages/AuthCallback";
import Agenda from "./pages/Agenda";
import CortexAI from "./pages/CortexAI";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Patients from "./pages/Patients";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Services from "./pages/Services";
import Signup from "./pages/Signup";
import WhatsAppMetaCallback from "./pages/WhatsAppMetaCallback";

function AppRedirect({
  to,
  title = "Redirecionando…",
  subtitle = "Só um instante.",
}: {
  to: string;
  title?: string;
  subtitle?: string;
}) {
  useEffect(() => {
    navigateToAppPath(to);
  }, [to]);

  return <GateLoader title={title} subtitle={subtitle} />;
}

/** Rota protegida — redireciona para /login se não autenticado */
function ProtectedRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <GateLoader
        title="Carregando…"
        subtitle="Só um instante para entrar no sistema."
      />
    );
  }

  if (!user) {
    return <AppRedirect to="/login" subtitle="Faça login para continuar." />;
  }

  return <Component />;
}

function GateLoader({
  title = "Carregando…",
  subtitle = "Só um instante.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] flex items-center justify-center px-4 relative overflow-hidden text-center">
      <div className="absolute top-0 -left-10 w-72 h-72 bg-[#23D996]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 -right-10 w-96 h-96 bg-[#025940]/5 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-[var(--cc-bg-white)] border border-[var(--cc-border)] rounded-3xl p-8 shadow-[0_10px_40px_rgba(2,89,64,0.05)]">
          <div className="w-10 h-10 mx-auto mb-5 rounded-full border-2 border-[var(--cc-tertiary)] border-t-transparent animate-spin" />
          <p className="font-['Syne'] font-800 text-[var(--cc-primary)] text-lg">
            {title}
          </p>
          <p className="mt-2 text-[13px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Rota protegida — exige onboarding concluído para acessar o app (ex.: /dashboard) */
function ProtectedOnboardedRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { user, loading } = useAuth();
  const navigatedRef = useRef(false);
  const entryQuery = useAppEntryGate(user?.id || null);

  useEffect(() => {
    if (!entryQuery.data || entryQuery.data.target === "/dashboard") return;
    navigatedRef.current = true;
    navigateToAppPath(entryQuery.data.target);
  }, [entryQuery.data]);

  if (loading) {
    return (
      <GateLoader
        title="Carregando…"
        subtitle="Só um instante para entrar no sistema."
      />
    );
  }

  if (!user) {
    return <AppRedirect to="/login" subtitle="Faça login para continuar." />;
  }

  if (entryQuery.isLoading && !entryQuery.data) {
    return (
      <GateLoader
        title="Carregando…"
        subtitle="Só um instante para entrar no sistema."
      />
    );
  }

  if (entryQuery.error) {
    return (
      <div className="min-h-screen bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] flex items-center justify-center px-6 text-center">
        <div className="max-w-md w-full cc-card rounded-2xl p-6">
          <p className="text-[var(--cc-text-primary)] font-['Syne'] font-700 text-lg">
            Não foi possível abrir sua conta
          </p>
          <p className="text-[var(--cc-text-muted)] mt-2 text-sm">
            Não foi possível carregar sua conta. Tente novamente.
          </p>
        </div>
      </div>
    );
  }

  if (!entryQuery.data || entryQuery.data.target !== "/dashboard") {
    if (!navigatedRef.current) navigateToAppPath("/dashboard");
    return null;
  }

  return (
    <AppShell>
      <Component />
    </AppShell>
  );
}

function AppIndex() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <GateLoader
        title="Carregando…"
        subtitle="Só um instante para entrar no sistema."
      />
    );
  }

  if (!user) {
    return <AppRedirect to="/login" subtitle="Faça login para continuar." />;
  }

  return <AppRedirect to="/dashboard" subtitle="Entrando no sistema." />;
}

function RedirectToApp() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    navigateToAppPath(next);
  }, []);

  return <GateLoader title="Redirecionando…" subtitle="Abrindo o app." />;
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={RedirectToApp} />
      <Route path="/signup" component={RedirectToApp} />
      <Route path="/auth/callback" component={RedirectToApp} />
      <Route path="/dashboard" component={RedirectToApp} />
      <Route path="/pacientes" component={RedirectToApp} />
      <Route path="/agenda" component={RedirectToApp} />
      <Route path="/servicos" component={RedirectToApp} />
      <Route path="/relatorios" component={RedirectToApp} />
      <Route path="/cortexai" component={RedirectToApp} />
      <Route path="/configuracoes" component={RedirectToApp} />
      <Route path="/onboarding" component={RedirectToApp} />
      <Route path="/onboarding/:step" component={RedirectToApp} />
      <Route
        path="/integrations/whatsapp/meta/callback"
        component={WhatsAppMetaCallback}
      />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={AppIndex} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/dashboard">
        <ProtectedOnboardedRoute component={Dashboard} />
      </Route>
      <Route path="/pacientes">
        <ProtectedOnboardedRoute component={Patients} />
      </Route>
      <Route path="/agenda">
        <ProtectedOnboardedRoute component={Agenda} />
      </Route>
      <Route path="/servicos">
        <ProtectedOnboardedRoute component={Services} />
      </Route>
      <Route path="/relatorios">
        <ProtectedOnboardedRoute component={Reports} />
      </Route>
      <Route path="/cortexai">
        <ProtectedOnboardedRoute component={CortexAI} />
      </Route>
      <Route path="/configuracoes">
        <ProtectedOnboardedRoute component={Settings} />
      </Route>
      <Route path="/onboarding">
        <ProtectedRoute component={Onboarding} />
      </Route>
      <Route path="/onboarding/:step">
        <ProtectedRoute component={Onboarding} />
      </Route>
      <Route
        path="/integrations/whatsapp/meta/callback"
        component={WhatsAppMetaCallback}
      />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Router() {
  const isApp =
    typeof window !== "undefined" && isAppHostname(window.location.hostname);
  return isApp ? <AppRouter /> : <PublicRouter />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <AuthProvider>
          <ThemeSessionSync />
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
