import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  session: null as any,
  listener: null as null | ((event: string, session: any) => void),
}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
  signOut: vi.fn(),
  catalogs: vi.fn(),
  dashboard: vi.fn(),
}));
vi.mock("../src/lib/supabase", () => ({
  configured: true,
  auth: mocks,
  supabase: {
    auth: {
      onAuthStateChange: (listener: typeof state.listener) => {
        state.listener = listener;
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                state.listener = null;
              },
            },
          },
        };
      },
    },
  },
}));
vi.mock("../src/lib/api", () => ({ api: mocks }));
vi.mock("../src/pages/Dashboard", () => ({
  DashboardPage: ({
    catalogs,
  }: {
    catalogs: { id: string; name: string }[];
  }) => (
    <section>
      <h1>Painel autenticado</h1>
      {catalogs.map((c) => (
        <span key={c.id}>{c.name}</span>
      ))}
    </section>
  ),
}));
import App from "../src/App";
beforeEach(() => {
  vi.clearAllMocks();
  state.session = null;
  window.location.hash = "";
  window.history.replaceState({}, "", "/");
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.catalogs.mockResolvedValue([]);
  mocks.dashboard.mockResolvedValue({ due: 0 });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(cleanup);
it("lets an expired recovery link request a fresh link without a session", async () => {
  window.history.replaceState({}, "", "/?recovery=1");
  render(<App />);
  await screen.findByText(/Link de recuperação inválido ou expirado/);
  expect(
    screen.queryByRole("button", { name: "Salvar nova senha" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
  await screen.findByRole("button", { name: "Enviar link de recuperação" });
  expect(mocks.updatePassword).not.toHaveBeenCalled();
  expect(mocks.catalogs).not.toHaveBeenCalled();
});
it("does not query study data before a session exists and reports login errors", async () => {
  mocks.signIn.mockResolvedValue({ error: new Error("Credenciais inválidas") });
  render(<App />);
  await screen.findByRole("button", { name: "Entrar na minha conta" });
  expect(mocks.catalogs).not.toHaveBeenCalled();
  expect(mocks.dashboard).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "aluno@example.invalid" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "senha-invalida" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Entrar na minha conta" }),
  );
  await screen.findByText("Credenciais inválidas");
  expect(mocks.signIn).toHaveBeenCalledWith(
    "aluno@example.invalid",
    "senha-invalida",
  );
});
it("clears the previous workspace when the authenticated user changes", async () => {
  const session = (id: string) => ({
    user: { id, email: `${id}@example.invalid` },
    access_token: "test-session",
    token_type: "bearer",
  });
  mocks.getSession.mockResolvedValue({
    data: { session: session("alice") },
    error: null,
  });
  mocks.catalogs
    .mockResolvedValueOnce([{ id: "a", name: "Acervo Alice" }])
    .mockResolvedValueOnce([{ id: "b", name: "Acervo Bob" }]);
  render(<App />);
  await screen.findByText("Acervo Alice");
  await act(async () => {
    state.listener?.("SIGNED_IN", session("bob"));
  });
  await screen.findByText("Acervo Bob");
  expect(screen.queryByText("Acervo Alice")).toBeNull();
  await act(async () => {
    state.listener?.("SIGNED_OUT", null);
  });
  await screen.findByRole("button", { name: "Entrar na minha conta" });
  expect(screen.queryByText("Acervo Bob")).toBeNull();
});
it("asks for email confirmation after sign-up without inventing a session", async () => {
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Criar conta" }));
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "aluno@example.invalid" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "uma-senha-de-teste" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  await screen.findByText(
    "Confira sua caixa de entrada e confirme seu e-mail para entrar.",
  );
  expect(mocks.catalogs).not.toHaveBeenCalled();
});
