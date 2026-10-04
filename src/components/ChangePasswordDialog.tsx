import { useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

export function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (next.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (next !== confirm) { toast.error("Passwords don't match"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: next, current_password: current } as any);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password changed");
    setOpen(false);
    setCurrent(""); setNext(""); setConfirm("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change password"><KeyRound /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Change password</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1"><Label>Current password</Label>
            <Input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div className="space-y-1"><Label>New password</Label>
            <Input type="password" required value={next} onChange={(e) => setNext(e.target.value)} /></div>
          <div className="space-y-1"><Label>Confirm new password</Label>
            <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          <DialogFooter><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Update password"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
