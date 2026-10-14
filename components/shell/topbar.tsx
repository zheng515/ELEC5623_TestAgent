import { Input } from "@/components/ui/input";

export function Topbar({ currentModel, onSelectModel, isRunning, configured }: {
  currentModel: string; onSelectModel: (model: string) => void; isRunning: boolean; configured: boolean;
}) {
  return (
    <header className="bg-white text-black scheme-light">
      <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-5">
        <strong className="text-2xl tracking-tight">REQTEST<span className="text-primary">.</span></strong>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="agent-model">OpenAI model</label>
          <Input id="agent-model" value={currentModel} onChange={(event) => onSelectModel(event.target.value)} disabled={isRunning} className="w-44 border-neutral-300" />
          <span>{isRunning ? "Running" : configured ? "Key configured" : "Key missing"}</span>
        </div>
      </div>
    </header>
  );
}
