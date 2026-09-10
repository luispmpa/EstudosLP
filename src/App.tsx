import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Database,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Target,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import { auth, configured, supabase } from "./lib/supabase";
import { api } from "./lib/api";
import type { Filters, Question } from "./domain/types";
import {
  ErrorBox,
  Loading,
  Spinner,
  errorText,
  useLoad,
} from "./components/ui";
import "./styles.css";
const DashboardPage = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.DashboardPage })),
);
const QuestionsPage = lazy(() =>
  import("./pages/Questions").then((m) => ({ default: m.QuestionsPage })),
);
const QuestionEditor = lazy(() =>
  import("./pages/QuestionEditor").then((m) => ({ default: m.QuestionEditor })),
);
const Study = lazy(() =>
  import("./pages/Study").then((m) => ({ default: m.Study })),
);
const ImportPage = lazy(() =>
  import("./pages/ImportPage").then((m) => ({ default: m.ImportPage })),
);
const HistoryPage = lazy(() =>
  import("./pages/History").then((m) => ({ default: m.HistoryPage })),
);
const Settings = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.Settings })),
);
type Page =
  | "dashboard"
  | "questions"
  | "reviews"
  | "errors"
  | "history"
  | "import"
  | "settings"
  | "editor"
  | "study";
const navigation = [
  { page: "dashboard" as Page, label: "Visão geral", Icon: LayoutDashboard },
  { page: "reviews" as Page, label: "Revisões de hoje", Icon: Clock3 },
  { page: "questions" as Page, label: "Banco de questões", Icon: BookOpen },
  { page: "errors" as Page, label: "Meus erros", Icon: Target },
  { page: "history" as Page, label: "Histórico", Icon: History },
];
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <GraduationCap size={24} strokeWidth={1.7} />
      </span>
      <span>
        Estudos<span className="brand-lp">LP</span>
        <small>CONHECIMENTO QUE FICA.</small>
      </span>
    </div>
  );
}
function Configuration() {
  return (
    <div className="welcome-layout">
      <section className="welcome-story">
        <Brand />
        <div className="welcome-copy">
          <div className="eyebrow">SEU ESPAÇO PARA IR ALÉM</div>
          <h1>
            Estude com intenção.
            <br />
            <em>Revise no seu ritmo.</em>
          </h1>
          <p>
            Questões, compreensão e revisão em um único lugar. Uma rotina de
            estudo construída por você.
          </p>
          <div className="welcome-principles">
            <span>
              <Check size={16} />
              Intervalos que você escolhe
            </span>
            <span>
              <Check size={16} />
              Uma história de cada resposta
            </span>
            <span>
              <Check size={16} />
              Seu acervo, sempre organizado
            </span>
          </div>
        </div>
        <span className="welcome-footer">
          Um passo de cada vez. Todos os dias.
        </span>
        <div className="welcome-rings" aria-hidden="true" />
      </section>
      <section className="welcome-form">
        <div className="setup-badge">
          <Database size={22} />
        </div>
        <div className="eyebrow">PREPARAR SEU AMBIENTE</div>
        <h2>Vamos conectar seus estudos.</h2>
        <p className="muted">
          A aplicação está pronta para se conectar ao seu projeto Supabase.
          Configure o ambiente para entrar e salvar seu progresso.
        </p>
        <ol className="setup-steps">
          <li>
            <span>1</span>
            <div>
              <strong>Crie o banco de dados</strong>
              <p>
                Aplique as migrations da pasta <code>supabase/migrations</code>{" "}
                ao seu projeto.
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Configure as variáveis públicas</strong>
              <p>
                Copie <code>.env.example</code> para <code>.env.local</code> e
                preencha a URL e a chave pública do projeto.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Inicie sua rotina</strong>
              <p>
                Reinicie a aplicação e crie sua conta. Seus dados ficarão
                associados ao seu usuário.
              </p>
            </div>
          </li>
        </ol>
        <a
          className="button primary"
          href="https://github.com/luispmpa/EstudosLP#readme"
          target="_blank"
          rel="noreferrer"
        >
          Consultar guia de configuração
          <ArrowRight size={17} />
        </a>
        <p className="auth-note">
          <ShieldCheck size={17} />
          Use apenas a chave pública. A chave administrativa não pertence ao
          frontend.
        </p>
      </section>
    </div>
  );
}
function AuthPage({
  recovery,
  onRecovered,
  initialNotice = "",
}: {
  recovery: boolean;
  onRecovered: () => void;
  initialNotice?: string;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">(
    recovery ? "reset" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice);
  const isReset = recovery;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (isReset) {
        const r = await auth.updatePassword(password);
        if (r.error) throw r.error;
        onRecovered();
      } else if (mode === "login") {
        const r = await auth.signIn(email, password);
        if (r.error) throw r.error;
      } else if (mode === "signup") {
        const r = await auth.signUp(email, password);
        if (r.error) throw r.error;
        setNotice(
          r.data.session
            ? "Conta criada."
            : "Confira sua caixa de entrada e confirme seu e-mail para entrar.",
        );
      } else {
        const r = await auth.resetPassword(email);
        if (r.error) throw r.error;
        setNotice(
          "Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.",
        );
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="welcome-layout">
      <section className="welcome-story">
        <Brand />
        <div className="welcome-copy">
          <div className="eyebrow">SEU ESPAÇO PARA IR ALÉM</div>
          <h1>
            Estude com intenção.
            <br />
            <em>Revise no seu ritmo.</em>
          </h1>
          <p>
            Não é sobre acumular questões. É sobre compreender, lembrar e
            avançar um pouco a cada dia.
          </p>
          <div className="welcome-principles">
            <span>
              <Check size={16} />
              Intervalos que você escolhe
            </span>
            <span>
              <Check size={16} />
              Uma história de cada resposta
            </span>
            <span>
              <Check size={16} />
              Seu acervo, sempre organizado
            </span>
          </div>
        </div>
        <span className="welcome-footer">
          Um passo de cada vez. Todos os dias.
        </span>
        <div className="welcome-rings" aria-hidden="true" />
      </section>
      <section className="welcome-form">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="eyebrow">BEM-VINDO AO ESTUDOSLP</div>
        <h2>
          {isReset
            ? "Crie sua nova senha"
            : mode === "login"
              ? "Bom ter você de volta."
              : mode === "signup"
                ? "Comece sua jornada."
                : "Recupere seu acesso."}
        </h2>
        <p className="muted">
          {isReset
            ? "Escolha uma senha com pelo menos 8 caracteres."
            : mode === "login"
              ? "Entre para continuar de onde parou."
              : mode === "signup"
                ? "Uma conta para organizar seu estudo e acompanhar sua evolução."
                : "Enviaremos um link seguro para o seu e-mail."}
        </p>
        <form onSubmit={submit} className="auth-form">
          <ErrorBox error={error} />
          {notice && (
            <div className="success-box" role="status">
              {notice}
            </div>
          )}
          {!isReset && (
            <label>
              E-mail
              <input
                autoFocus
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
              />
            </label>
          )}
          {(isReset || mode !== "reset") && (
            <label>
              Senha
              <input
                type="password"
                required
                minLength={mode === "signup" || isReset ? 8 : 1}
                autoComplete={
                  isReset || mode === "signup"
                    ? "new-password"
                    : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "signup" || isReset
                    ? "Pelo menos 8 caracteres"
                    : "Sua senha"
                }
              />
            </label>
          )}
          {mode === "login" && !isReset && (
            <button
              type="button"
              className="text-button forgot-password"
              onClick={() => {
                setMode("reset");
                setError("");
                setNotice("");
              }}
            >
              Esqueci minha senha
            </button>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? <Spinner /> : <ArrowRight size={17} />}{" "}
            {isReset
              ? "Salvar nova senha"
              : mode === "login"
                ? "Entrar na minha conta"
                : mode === "signup"
                  ? "Criar conta"
                  : "Enviar link de recuperação"}
          </button>
        </form>
        {!isReset && (
          <p className="auth-switch">
            {mode === "login" ? "Ainda não tem uma conta?" : ""}
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
                setNotice("");
              }}
            >
              {mode === "login" ? "Criar conta" : "Voltar para entrar"}
            </button>
          </p>
        )}
        <p className="auth-note">
          <ShieldCheck size={17} />
          Seu acervo e seu progresso ficam protegidos na sua conta.
        </p>
      </section>
    </div>
  );
}
function Workspace({
  session,
  dark,
  onDark,
}: {
  session: Session;
  dark: boolean;
  onDark: () => void;
}) {
  const initial = window.location.hash.replace("#", "");
  const [page, setPage] = useState<Page>(
    navigation.some((n) => n.page === initial) ||
      ["settings", "import"].includes(initial)
      ? (initial as Page)
      : "dashboard",
  );
  const [mobileMenu, setMobileMenu] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [question, setQuestion] = useState<Question>();
  const [studyFilters, setStudyFilters] = useState<Filters>({});
  const [historyQuestion, setHistoryQuestion] = useState<string>();
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [signingOut, setSigningOut] = useState(false);
  const catalogs = useLoad(() => api.catalogs(), [refresh]);
  const dashboard = useLoad(() => api.dashboard(), [refresh]);
  const triggerRefresh = () => setRefresh((v) => v + 1);
  const go = (next: Page) => {
    setPage(next);
    setMobileMenu(false);
    setError("");
    if (next === "history") setHistoryQuestion(undefined);
    window.location.hash = next;
    window.scrollTo({ top: 0 });
  };
  const startStudy = (filters: Filters, q?: Question) => {
    setStudyFilters(filters);
    setQuestion(q);
    go("study");
  };
  const edit = (q?: Question) => {
    setQuestion(q);
    go("editor");
  };
  useEffect(() => {
    const change = () => setOffline(!navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  useEffect(() => {
    const change = () => {
      const hash = window.location.hash.replace("#", "") as Page;
      if (
        navigation.some((n) => n.page === hash) ||
        ["settings", "import"].includes(hash)
      )
        setPage(hash);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const common = { catalogs: catalogs.data ?? [], refresh };
  const pageLabel =
    navigation.find((n) => n.page === page)?.label ??
    (
      {
        import: "Importação",
        settings: "Configurações",
        editor: "Cadastro de questão",
        study: "Sessão de estudo",
      } as Record<string, string>
    )[page];
  return (
    <div className={`app-shell ${page === "study" ? "study-shell" : ""}`}>
      <a className="skip-link" href="#main-content">
        Pular para conteúdo
      </a>
      {mobileMenu && (
        <button
          className="nav-scrim"
          aria-label="Fechar menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            aria-label="Fechar menu"
            onClick={() => setMobileMenu(false)}
          >
            <X size={19} />
          </button>
        </div>
        <div className="sidebar-label">SEU ESTUDO</div>
        <nav aria-label="Navegação principal">
          {navigation.map(({ page: dest, label, Icon }) => (
            <button
              key={dest}
              className={`nav-item ${page === dest ? "active" : ""}`}
              onClick={() => go(dest)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {dest === "reviews" && !!dashboard.data?.due && (
                <b>{dashboard.data.due}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-label organize-label">SEU ESPAÇO</div>
        <nav aria-label="Organização">
          <button
            className={`nav-item ${page === "import" ? "active" : ""}`}
            onClick={() => go("import")}
          >
            <Upload size={19} />
            <span>Importar questões</span>
          </button>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings2 size={19} />
            <span>Configurações</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="rhythm-note">
            <span className="rhythm-symbol">↗</span>
            <strong>
              Pequenos passos.
              <br />
              Conhecimento duradouro.
            </strong>
            <p>Seu próximo estudo faz diferença.</p>
          </div>
          <div className="user-row">
            <div className="avatar">
              {session.user.email?.[0]?.toUpperCase() ?? "E"}
            </div>
            <div>
              <strong>Meu espaço</strong>
              <span title={session.user.email}>{session.user.email}</span>
            </div>
            <button
              className="icon-button"
              title="Sair da conta"
              aria-label="Sair da conta"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                try {
                  const r = await auth.signOut();
                  if (r.error) throw r.error;
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setSigningOut(false);
                }
              }}
            >
              {signingOut ? <Spinner /> : <LogOut size={17} />}
            </button>
          </div>
        </div>
      </aside>
      <div className="main-layout">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Meu espaço <span>/</span> <strong>{pageLabel}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            <button className="top-search" onClick={() => go("questions")}>
              <Search size={16} />
              <span>Encontre uma questão</span>
            </button>
            <button
              className="icon-button"
              aria-label={`Ativar tema ${dark ? "claro" : "escuro"}`}
              onClick={onDark}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <a
              className="icon-button help-link"
              href="https://github.com/luispmpa/EstudosLP#readme"
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir guia do EstudosLP"
            >
              <CircleHelp size={19} />
            </a>
            <div className="top-avatar">
              {session.user.email?.[0]?.toUpperCase() ?? "E"}
            </div>
          </div>
        </header>
        {offline && (
          <div className="offline-banner" role="status">
            <WifiOff size={16} />
            Você está sem conexão. Reconecte para consultar e salvar seus
            estudos.
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          <ErrorBox error={error} />
          {catalogs.error && (
            <div className="page-inline-error">
              <ErrorBox error={catalogs.error} retry={catalogs.reload} />
            </div>
          )}
          <Suspense
            fallback={
              <div className="page">
                <Loading />
              </div>
            }
          >
            {page === "dashboard" && (
              <DashboardPage
                {...common}
                onStudy={startStudy}
                onQuestions={() => go("questions")}
                onImport={() => go("import")}
              />
            )}{" "}
            {["questions", "reviews", "errors"].includes(page) && (
              <QuestionsPage
                key={page}
                {...common}
                initialMode={
                  page === "reviews"
                    ? "due"
                    : page === "errors"
                      ? "errors"
                      : "all"
                }
                onEdit={edit}
                onStudy={startStudy}
                onImport={() => go("import")}
              />
            )}{" "}
            {page === "editor" && (
              <QuestionEditor
                key={question?.id ?? "new"}
                catalogs={common.catalogs}
                question={question}
                onBack={() => go("questions")}
                onSaved={() => {
                  triggerRefresh();
                  go("questions");
                }}
              />
            )}{" "}
            {page === "study" && (
              <Study
                key={`${question?.id ?? "queue"}-${JSON.stringify(studyFilters)}`}
                catalogs={common.catalogs}
                initialQuestion={question}
                filters={studyFilters}
                onBack={() => go("questions")}
                onHistory={(id) => {
                  go("history");
                  setHistoryQuestion(id);
                }}
                onSettings={() => go("settings")}
                onRefresh={triggerRefresh}
              />
            )}{" "}
            {page === "history" && (
              <HistoryPage
                key={historyQuestion ?? "all"}
                {...common}
                questionId={historyQuestion}
                onQuestion={(q) => startStudy({}, q)}
              />
            )}{" "}
            {page === "import" && <ImportPage onImported={triggerRefresh} />}{" "}
            {page === "settings" && (
              <Settings
                catalogs={common.catalogs}
                onRefresh={triggerRefresh}
                dark={dark}
                onDark={onDark}
              />
            )}
          </Suspense>
        </main>
        <footer className="app-footer">
          <span>EstudosLP</span>
          <span>Resolver. Compreender. Revisar.</span>
        </footer>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Navegação móvel">
        {navigation
          .filter((n) => n.page !== "errors")
          .map(({ page: dest, label, Icon }) => (
            <button
              key={dest}
              className={page === dest ? "active" : ""}
              onClick={() => go(dest)}
            >
              <Icon size={21} />
              <span>
                {dest === "dashboard"
                  ? "Início"
                  : dest === "reviews"
                    ? "Revisões"
                    : dest === "questions"
                      ? "Questões"
                      : label}
              </span>
            </button>
          ))}
        <button onClick={() => setMobileMenu(true)}>
          <Menu size={21} />
          <span>Mais</span>
        </button>
      </nav>
    </div>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="fatal-error">
        <BookOpen size={34} />
        <h1>Algo interrompeu esta tela.</h1>
        <p>
          Recarregue para tentar novamente. Seus dados salvos permanecem na sua
          conta.
        </p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Recarregar
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [recovery, setRecovery] = useState(
    new URLSearchParams(window.location.search).has("recovery"),
  );
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("estudoslp-theme") === "dark";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("estudoslp-theme", dark ? "dark" : "light");
    } catch {
      /* Appearance preference is optional. */
    }
  }, [dark]);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          setSession(data.session);
          if (recovery && !data.session) {
            setRecovery(false);
            setAuthNotice(
              "Link de recuperação inválido ou expirado. Use Esqueci minha senha para solicitar outro link.",
            );
            window.history.replaceState({}, "", window.location.pathname);
          } else {
            setError(error?.message ?? "");
          }
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorText(e));
          setLoading(false);
        }
      });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <ErrorBoundary>
      {!configured ? (
        <Configuration />
      ) : loading ? (
        <div className="boot-screen">
          <Brand />
          <Spinner />
          <p>Preparando seu espaço de estudo…</p>
        </div>
      ) : error ? (
        <div className="fatal-error">
          <ErrorBox error={error} retry={() => window.location.reload()} />
        </div>
      ) : recovery || !session ? (
        <AuthPage
          key={recovery && session ? "recovery" : "login"}
          recovery={recovery && !!session}
          initialNotice={authNotice}
          onRecovered={() => {
            setRecovery(false);
            window.history.replaceState({}, "", window.location.pathname);
          }}
        />
      ) : (
        <Workspace
          key={session.user.id}
          session={session}
          dark={dark}
          onDark={() => setDark((d) => !d)}
        />
      )}
    </ErrorBoundary>
  );
}
