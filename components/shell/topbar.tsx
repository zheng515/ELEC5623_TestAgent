import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Dialog } from "radix-ui";
import { Settings, X } from "lucide-react";

export function Topbar({ currentModel, onSelectModel, isRunning, configured }: {
  currentModel: string; onSelectModel: (model: string) => void; isRunning: boolean; configured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draftModel, setDraftModel] = useState(currentModel);
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState<{ model: string; message: string; connected: boolean }>();
  const model = draftModel.trim();
  async function check() {
    setChecking(true);
    try {
      const response = await fetch('/api/model/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
      const data = await response.json();
      const connected = response.ok && data.connected === true;
      setConnection({ model, connected, message: connected ? 'Connection verified' : data.error || 'Connection failed' });
    } catch { setConnection({ model, connected: false, message: 'Cannot reach the server.' }); }
    finally { setChecking(false); }
  }
  return (
    <header className="bg-white text-black scheme-light">
      <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-5">
        <strong className="text-2xl tracking-tight">REQTEST<span className="text-primary">.</span></strong>
        <div className="flex items-center gap-3 text-sm">
          {isRunning && <span role="status">Running</span>}
          <Dialog.Root open={open} onOpenChange={value => { if (value) setDraftModel(currentModel); setOpen(value); }}>
            <Dialog.Trigger asChild><Button variant="outline" className="border-neutral-300 bg-white text-black hover:bg-neutral-100 hover:text-black"><Settings aria-hidden="true" />Settings</Button></Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 text-foreground scheme-dark shadow-xl">
                <div className="flex items-center justify-between gap-4">
                  <Dialog.Title className="text-2xl font-bold">Settings</Dialog.Title>
                  <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close settings"><X aria-hidden="true" /></Button></Dialog.Close>
                </div>
                <Dialog.Description className="mt-2 text-sm text-muted-foreground">Choose the model for future project verification. Existing reports keep their recorded model.</Dialog.Description>
                <form className="mt-6 space-y-4" onSubmit={event => { event.preventDefault(); if (isRunning || checking || !model) return; onSelectModel(model); setOpen(false); }}>
                  <label className="block space-y-2" htmlFor="agent-model"><span>OpenAI model</span><Input id="agent-model" value={draftModel} maxLength={100} required disabled={isRunning || checking} onChange={event => setDraftModel(event.target.value)} /></label>
                  <p className="text-sm text-muted-foreground">{configured ? 'Server API key present. Check the connection to confirm model access.' : 'Server API key missing. Configure OPENAI_API_KEY in .env.local, then restart.'}</p>
                  {isRunning && <p className="text-sm">Model settings are locked while verification is running.</p>}
                  <Button type="button" variant="outline" disabled={isRunning || checking || !configured || !model} onClick={check}>{checking ? 'Checking…' : 'Check model connection'}</Button>
                  {connection?.model === model && <p role="status" className={connection.connected ? 'text-foreground' : 'text-red-400'}>{connection.message}</p>}
                  <div className="flex justify-end gap-3 pt-2"><Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close><Button type="submit" disabled={isRunning || checking || !model}>Save settings</Button></div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
