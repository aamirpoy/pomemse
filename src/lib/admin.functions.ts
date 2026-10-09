import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isOwnerEmail } from "@/lib/owner";

async function targetIsOwner(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.admin.getUserById(id);
  return isOwnerEmail(data.user?.email);
}
function callerIsOwner(context: any) {
  return isOwnerEmail(context.claims?.email);
}

const employeeSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(1).max(120),
  employee_code: z.string().trim().max(40).optional().default(""),
  department: z.string().trim().max(80).optional().default(""),
});

async function adminCount() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  return count ?? 0;
}

async function createAccount(
  input: z.infer<typeof employeeSchema>,
  role: "admin" | "employee",
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name },
  });
  if (error || !data.user) throw new Error(error?.message ?? "Could not create account");
  const id = data.user.id;
  await supabaseAdmin.from("profiles").insert({
    id,
    full_name: input.full_name,
    employee_code: input.employee_code || null,
    department: input.department || null,
    email: input.email,
  });
  await supabaseAdmin.from("user_roles").insert({ user_id: id, role });
  return { id };
}

export const getSetupStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { needsSetup: (await adminCount()) === 0 };
});

export const bootstrapAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => employeeSchema.parse(d))
  .handler(async ({ data }) => {
    if ((await adminCount()) > 0) throw new Error("Setup already completed");
    return createAccount(data, "admin");
  });

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => employeeSchema.extend({ is_admin: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.is_admin && !callerIsOwner(context)) throw new Error("Only the owner can give admin access");
    return createAccount(data, data.is_admin ? "admin" : "employee");
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.id === context.userId) throw new Error("You can't remove yourself");
    if (await targetIsOwner(data.id)) throw new Error("The owner account can't be removed");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if ((await targetIsOwner(data.id)) && !callerIsOwner(context)) throw new Error("Only the owner can reset the owner's password");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), admin: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (!callerIsOwner(context)) throw new Error("Only the owner can change admin access");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.admin) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: data.id, role: "admin" }, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id).eq("role", "admin");
      await supabaseAdmin.from("user_roles").upsert({ user_id: data.id, role: "employee" }, { onConflict: "user_id,role" });
    }
    return { ok: true };
  });
