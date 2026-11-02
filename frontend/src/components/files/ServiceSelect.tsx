import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface Option {
  value: string;
  label: string;
}

// "" = all services
export default function ServiceSelect({ value, onChange, options, testId }: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  testId: string;
}) {
  const label = (v: string) => (v ? (options.find((o) => o.value === v)?.label ?? "All services") : "All services");
  return (
    <Select value={value || "__all"} onValueChange={(v: string) => onChange(v === "__all" ? "" : v)}>
      <SelectTrigger className="w-full sm:w-56 bg-white" data-testid={testId}>
        <SelectValue>{(v) => label(v === "__all" ? "" : (v as string))}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all" data-testid={`${testId}-option-all`}>
          All services
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} data-testid={`${testId}-option-${o.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
