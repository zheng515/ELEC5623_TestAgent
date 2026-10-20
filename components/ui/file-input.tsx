"use client";
import { useId, useRef, useState, type ComponentProps } from "react";
import { Button } from "./button";

export function FileInput({ onChange, disabled, ...props }: Omit<ComponentProps<"input">, "type">) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("No file selected");
  return <div className="flex gap-3 items-center border rounded-md p-2 min-w-0">
    <input {...props} id={id} ref={input} type="file" hidden style={{ display: "none" }} disabled={disabled} onChange={event => { setName(event.target.files?.[0]?.name || "No file selected"); onChange?.(event); }} />
    <Button type="button" variant="outline" disabled={disabled} aria-controls={id} onClick={() => input.current?.click()}>Choose file</Button>
    <span className="truncate text-sm text-muted-foreground" title={name}>{name}</span>
  </div>;
}
