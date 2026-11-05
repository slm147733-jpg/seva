import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/api";
import { errorMessage } from "@/lib/hooks";
import { beginSession } from "@/lib/session";
import type { SetupStatus, UserOut } from "@/lib/types";

export default function Login() {
  const navigate = useNavigate();
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const setup = useQuery({ queryKey: ["setup-status"], queryFn: () => apiGet<SetupStatus>("/auth/setup-status") });

  const login = useMutation({
    mutationFn: () => apiPost<UserOut>("/auth/login", { mobile, password }),
    onSuccess: (user) => {
      beginSession();
      toast.success(`Welcome, ${user.name}`);
      navigate(user.role === "admin" ? "/admin" : "/portal", { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e, "Login failed")),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };

  return (
    <AuthShell title="Sign in" subtitle="Use your registered mobile number and password.">
      {setup.data?.needs_setup && (
        <Link
          to="/admin/setup"
          className="mb-6 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 hover:bg-amber-100 transition-colors"
          data-testid="login-setup-banner"
        >
          <Sparkles className="size-5 text-orange-600" />
          <span>
            No admin yet. <strong>Create the first admin account →</strong>
          </span>
        </Link>
      )}
      <form onSubmit={submit} className="space-y-5" data-testid="login-form">
        <div className="space-y-2">
          <Label htmlFor="mobile">Mobile number</Label>
          <div className="flex">
            <span className="inline-flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-stone-600">
              +91
            </span>
            <Input
              id="mobile"
              inputMode="numeric"
              maxLength={10}
              placeholder="9876543210"
              className="h-11 rounded-l-none"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
              required
              data-testid="login-mobile-input"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            className="h-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            data-testid="login-password-input"
          />
        </div>
        <Button
          type="submit"
          className="w-full h-11 text-base active:scale-[0.98] transition-transform"
          disabled={login.isPending || mobile.length !== 10 || !password}
          data-testid="login-submit-button"
        >
          {login.isPending && <Loader2 className="size-4 animate-spin" />} Sign in
        </Button>
      </form>
      <p className="mt-8 text-sm text-stone-500">
        Don't have an account? Ask your Sevakendra admin to create one.{" "}
        <Link to="/" className="text-orange-700 font-medium hover:underline" data-testid="login-back-home">
          Back to website
        </Link>
      </p>
    </AuthShell>
  );
}
