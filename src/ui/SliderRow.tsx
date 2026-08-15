interface SliderRowProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  /** 显示值（默认直接显示 value）。 */
  display?: number | string;
  onChange: (value: number) => void;
}

/** 设置项滑块行（设置面板与暂停菜单共用）。 */
export function SliderRow({ label, min, max, step, value, display, onChange }: SliderRowProps) {
  return (
    <label className="slider-row">
      {label}：{display ?? value}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
