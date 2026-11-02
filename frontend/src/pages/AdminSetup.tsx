import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/api";
import { errorMessage } from "@/lib/hooks";
import { beginSession } from "@/lib/session";
import type { SetupStatus, UserOut } from "@/lib/types";

export default function AdminSetup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", mobile: "", password: "", confirm: "" });
  const status = useQuery({ queryKey: ["setup-status"], queryFn: () => apiGet<SetupStatus>("/auth/setup-status") });

  const setup = useMutation({
    mutationFn: () =>
      apiPost<UserOut>("/auth/setup", { name: form.name, mobile: form.mobile, password: form.password }),
    onSuccess: () => {
      beginSession();
      toast.success("Admin account created");
      navigate("/admin", { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e, "Setup failed")),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error("Passwords do not match");
    setup.mutate();
  };

  const badge = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">
      <ShieldCheck className="size-3.5" /> One-time setup
    </span>
  );

  if (status.data && !status.data.needs_setup) {
    return (
      <AuthShell title="Admin already set up" subtitle="The first admin account exists. Please sign in." badge={badge}>
        <Link to="/login" className={buttonVariants({ size: "lg" })} data-testid="setup-go-login">
          Go to login
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create admin account"
      subtitle="This first account controls the website, pages, links and all user logins."
      badge={badge}
    >
      <form onSubmit={submit} className="space-y-5" data-testid="setup-form">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            className="h-11"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            minLength={2}
            data-testid="setup-name-input"
          />
        </div>
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
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "") })}
              required
              data-testid="setup-mobile-input"
            />
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Create password</Label>
            <Input
              id="password"
              type="password"
              className="h-11"
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              data-testid="setup-password-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              className="h-11"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              required
              data-testid="setup-confirm-input"
            />
          </div>
        </div>
        <Button
          type="submit"
          className="w-full h-11 text-base active:scale-[0.98] transition-transform"
          disabled={setup.isPending}
          data-testid="setup-submit-button"
        >
          {setup.isPending && <Loader2 className="size-4 animate-spin" />} Create admin & continue
        </Button>
      </form>
    </AuthShell>
  );
}
