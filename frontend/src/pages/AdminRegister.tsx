import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { errorMessage } from "@/lib/hooks";
import type { AdminRegisterIn, AdminRequest } from "@/lib/types";

const strongEnough = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

// Request admin access. The account can't log in until the owner approves it.
export default function AdminRegister() {
  const [form, setForm] = useState({ name: "", mobile: "", password: "", confirm: "" });
  const reg = useMutation({
    mutationFn: () => apiPost<AdminRequest>("/auth/admin-register", { name: form.name, mobile: form.mobile, password: form.password } satisfies AdminRegisterIn),
    onError: (e) => toast.error(errorMessage(e, "Could not send request")),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(form.mobile)) return toast.error("Enter a valid 10-digit mobile number");
    if (!strongEnough(form.password)) return toast.error("Password needs 8+ characters with a letter and a number");
    if (form.password !== form.confirm) return toast.error("Passwords do not match");
    reg.mutate();
  };
  const badge = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">
      <ShieldCheck className="size-3.5" /> Owner approval required
    </span>
  );

  if (reg.isSuccess) {
    return (
      <AuthShell title="Request sent" subtitle="The owner will review your request.">
        <div className="space-y-5" data-testid="admin-register-success">
          {badge}
          <div className="flex gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <CheckCircle2 className="size-5 shrink-0 text-green-700" />
            <p>
              Your admin request for <strong className="font-mono">{reg.data.mobile}</strong> is waiting for approval. You can sign in with this
              number and password once the owner approves it.
            </p>
          </div>
          <Link to="/login" className={buttonVariants({ className: "h-11" })} data-testid="admin-register-go-login">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <AuthShell title="Register as admin" subtitle="Send a request to the owner. You can sign in after approval.">
      <form onSubmit={submit} className="space-y-5" data-testid="admin-register-form">
        {badge}
        <div className="space-y-2">
          <Label htmlFor="r-name">Full name</Label>
          <Input id="r-name" className="h-11" value={form.name} onChange={set("name")} required minLength={2} data-testid="admin-register-name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-mobile">Mobile number</Label>
          <Input
            id="r-mobile"
            className="h-11 font-mono"
            inputMode="numeric"
            maxLength={10}
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "") })}
            required
            data-testid="admin-register-mobile"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-pw">Password</Label>
          <Input id="r-pw" type="password" className="h-11" value={form.password} onChange={set("password")} required data-testid="admin-register-password" />
          <p className={`text-xs ${form.password && !strongEnough(form.password) ? "text-red-600" : "text-stone-500"}`} data-testid="admin-register-password-rule">
            At least 8 characters, with a letter and a number.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-pw2">Confirm password</Label>
          <Input id="r-pw2" type="password" className="h-11" value={form.confirm} onChange={set("confirm")} required data-testid="admin-register-confirm" />
        </div>
        <Button type="submit" className="w-full h-11" disabled={reg.isPending} data-testid="admin-register-submit">
          {reg.isPending ? <Loader2 className="size-4 animate-spin" /> : "Send request"}
        </Button>
        <p className="text-center text-sm text-stone-500">
          Already approved?{" "}
          <Link to="/login" className="font-medium text-orange-700 hover:underline" data-testid="admin-register-login-link">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
