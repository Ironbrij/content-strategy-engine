import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "default" | "icon";
}

export function CopyButton({
  text,
  label,
  className,
  variant = "ghost",
  size = "icon",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Copy failed", err);
    }
  }

  const Icon = copied ? Check : Copy;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleCopy}
      className={cn(
        "text-muted-foreground hover:text-primary",
        copied && "text-primary",
        className,
      )}
      aria-label={copied ? "Copied" : label ?? "Copy"}
    >
      <Icon className="h-4 w-4" />
      {size !== "icon" && (
        <span className="ml-2 text-xs font-medium">
          {copied ? "Copied" : label ?? "Copy"}
        </span>
      )}
    </Button>
  );
}
