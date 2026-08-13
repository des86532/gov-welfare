"use client";

import { useId, useState } from "react";

type RationalePreset = {
  label: string;
  value: string;
};

export function AdminRationaleField({
  defaultValue,
  presets,
  minLength = 10,
  placeholder,
}: {
  defaultValue: string;
  presets: RationalePreset[];
  minLength?: number;
  placeholder?: string;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="rationale-field">
      <div className="rationale-field-heading">
        <label htmlFor={id}>Rationale</label>
        <div className="rationale-presets" aria-label="快速填入 Rationale">
          {presets.map((preset) => (
            <button key={preset.label} type="button" onClick={() => setValue(preset.value)}>
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <textarea
        id={id}
        name="rationale"
        required
        minLength={minLength}
        maxLength={1_000}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
      />
      <small>已預填常用理由；確認內容正確即可送出，也可以直接修改。</small>
    </div>
  );
}
