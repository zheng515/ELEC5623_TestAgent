import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function Topbar({ currentModel, onSelectModel, isRunning, configured }: {
  currentModel: string; onSelectModel: (model: string) => void; isRunning: boolean; configured: boolean;
}) {
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState<{ model: string; message: string; connected: boolean }>();
  async function check() {
    setChecking(true);
    try {
      const response = await fetch('/api/model/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: currentModel }) });
      const data = await response.json();
      setConnection({model:currentModel,connected:response.ok && data.connected === true,message:response.ok ? 'Connection verified' : data.error || 'Connection failed'});
    } catch {setConnection({model:currentModel,connected:false,message:'Cannot reach the server.'});}
    finally {setChecking(false);}
  }
  return (
    <header className="bg-white text-black scheme-light">
      <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-5">
        <strong className="text-2xl tracking-tight">REQTEST<span className="text-primary">.</span></strong>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="agent-model">OpenAI model</label>
          <Input id="agent-model" value={currentModel} onChange={(event) => onSelectModel(event.target.value)} disabled={isRunning} className="w-44 border-neutral-300" />
          <span>{isRunning ? "Running" : configured ? "Key present" : "Key missing"}</span>
          <Button variant="outline" style={{backgroundColor:"white",color:"black",borderColor:"#d4d4d4"}} disabled={isRunning || checking || !configured} onClick={check}>{checking ? 'Checking…' : 'Check model connection'}</Button>
          {connection?.model === currentModel && <span role="status" className={connection.connected ? 'text-neutral-700' : 'text-red-600'}>{connection.message}</span>}
        </div>
      </div>
    </header>
  );
}
