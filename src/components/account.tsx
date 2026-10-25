"use client";

import { PlugZap, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { call, useResource } from "@/client/fetch";
import { Badge, Empty, Field, ago } from "./kit";
import { PageTitle, PortalShell, usePortalUser } from "./portal";
import { Avatar } from "./ui";

type Grant = { appId: string; name: string; description: string; scopes: string[]; authorizedAt: number };

export function ConnectedApps() {
  return (
    <PortalShell>
      <Grants />
    </PortalShell>
  );
}

function Grants() {
  const { data, reload } = useResource<{ grants: Grant[] }>("/api/grants");
  return (
    <>
      <PageTitle title="Connected apps" sub="Apps you've allowed to use your Convene account. Removing one revokes its tokens and stops its webhooks." />
      <div className="space-y-3">
        {data && !data.grants.length && (
          <Empty icon={<PlugZap size={22} />} title="No connected apps">
            When you allow an app to use your account, it appears here.
          </Empty>
        )}
        {data?.grants.map((g) => (
          <div key={g.appId} className="card flex flex-wrap items-start gap-4 p-5">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/20 font-semibold text-accent-ink">{g.name[0]?.toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{g.name}</div>
              {g.description && <p className="mt-0.5 text-sm text-ink-2">{g.description}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {g.scopes.map((s) => (
                  <Badge key={s} tone="accent">
                    {s}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Authorized {ago(g.authorizedAt)}</p>
            </div>
            <button
              className="btn h-9 text-sm text-danger"
              onClick={async () => {
                await call(`/api/grants/${g.appId}`, "DELETE");
                reload();
              }}
            >
              Remove access
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export function Profile() {
  return (
    <PortalShell>
      <ProfileForm />
    </PortalShell>
  );
}

function ProfileForm() {
  const me = usePortalUser();
  const [name, setName] = useState(me.name);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <PageTitle title="Profile" />
      <div className="card max-w-xl p-6">
        <div className="mb-6 flex items-center gap-4">
          <Avatar name={name || me.name} size={56} />
          <div>
            <div className="font-semibold">{name || me.name}</div>
            <div className="text-sm text-ink-2">{me.email}</div>
          </div>
        </div>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await call("/api/auth/me", "PATCH", { name });
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          }}
        >
          <Field label="Display name" hint="Shown to others in meetings you host from this account.">
            <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button className="btn btn-primary">{saved ? "Saved" : "Save"}</button>
        </form>
        <p className="mt-6 flex items-start gap-2 border-t border-line pt-5 text-sm text-ink-2">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-good" />
          Passwords are stored as scrypt hashes, and sessions as SHA-256 hashes of a random token.
        </p>
      </div>
    </>
  );
}
