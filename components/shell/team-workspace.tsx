"use client";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TeamWorkspace({ userId }: { userId: string }) {
  const { data: organizations, refetch } = authClient.useListOrganizations();
  const { data: active, refetch: refreshActive } = authClient.useActiveOrganization();
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [invitations, setInvitations] = useState<{ id: string; organizationName: string; role: string }[]>([]);
  const role = active?.members.find(member => member.userId === userId)?.role;
  const manage = role?.split(",").some(value => ["owner", "admin"].includes(value));
  async function action(task: () => Promise<{ error?: { message?: string } | null }>) {
    setBusy(true); setMessage("");
    try { const result = await task(); if (result.error) throw new Error(result.error.message); await refetch(); await refreshActive(); setMessage("Workspace updated."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Workspace action failed."); }
    finally { setBusy(false); }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    action(() => authClient.organization.create({ name: String(form.get("name")), slug: String(form.get("slug")) }));
  }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    action(() => authClient.organization.inviteMember({ email: String(form.get("email")), role: form.get("role") === "admin" ? "admin" : "member", organizationId: active!.id }));
  }
  return <details className="border rounded p-4"><summary className="cursor-pointer font-semibold">Team workspace{active ? ": " + active.name : ""}</summary><div className="space-y-4 mt-4">
    <p>Reports remain private until their owner explicitly shares them with a workspace. Workspace members can read shared reports; only the report owner can stop, re-run or change sharing.</p>
    <label>Active workspace<select className="block border bg-background p-2" disabled={busy} value={active?.id || ""} onChange={event => action(() => authClient.organization.setActive({ organizationId: event.target.value || null }))}><option value="">Personal workspace</option>{organizations?.map(organization => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
    <form noValidate onSubmit={create} className="flex flex-wrap gap-2"><Input name="name" placeholder="Workspace name" required maxLength={100} /><Input name="slug" placeholder="unique-workspace-slug" pattern="[a-z0-9-]+" required maxLength={100} /><Button disabled={busy}>Create workspace</Button></form>
    <Button variant="outline" disabled={busy} onClick={async () => { const result = await authClient.organization.listUserInvitations(); if (result.error) setMessage(result.error.message || "Verify your email before checking invitations."); else setInvitations(result.data || []); }}>Check my invitations</Button>
    {invitations.map(invitation => <div className="flex gap-3" key={invitation.id}><p>{invitation.organizationName} · {invitation.role}</p><Button disabled={busy} onClick={() => action(async () => { const result = await authClient.organization.acceptInvitation({ invitationId: invitation.id }); if (!result.error) setInvitations(items => items.filter(item => item.id !== invitation.id)); return result; })}>Accept invitation</Button></div>)}
    {active && <div className="space-y-3"><p>Your role: {role || "Unknown"}</p>{manage && <form noValidate onSubmit={invite} className="flex flex-wrap gap-2"><Input type="email" name="email" placeholder="teammate@example.com" required /><select name="role" className="border bg-background p-2"><option value="member">Member</option><option value="admin">Admin</option></select><Button disabled={busy}>Invite teammate</Button></form>}
      {active.members.map(member => <div className="flex flex-wrap gap-3 items-center" key={member.id}><span>{member.user.name} · {member.user.email} · {member.role}</span>{manage && member.userId !== userId && <><select className="border bg-background p-2" value={member.role} disabled={busy} onChange={event => action(() => authClient.organization.updateMemberRole({ memberId: member.id, role: event.target.value as "member" | "admin" | "owner", organizationId: active.id }))}><option value="member">Member</option><option value="admin">Admin</option><option value="owner">Owner</option></select><Button variant="outline" disabled={busy} onClick={() => action(() => authClient.organization.removeMember({ memberIdOrEmail: member.id, organizationId: active.id }))}>Remove member</Button></>}</div>)}
    </div>}
    {message && <p role="status">{message}</p>}
  </div></details>;
}
