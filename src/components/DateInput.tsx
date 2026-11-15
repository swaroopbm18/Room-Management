"use client";

import { useState } from "react";
import { isSunday } from "@/lib/time";

/**
 * A date field that refuses Sundays and holidays as you pick, with the reason under it,
 * instead of after the form is sent. A make-up Sunday (listed in workingSundays) is allowed.
 */
export default function DateInput({
  holidays = {},
  allowSunday = false,
  workingSundays = [],
  defaultValue,
  className = "input",
  ...rest
}: {
  /** date → holiday name; these dates are refused. */
  holidays?: Record<string, string>;
  allowSunday?: boolean;
  /** Sundays that run a weekday's timetable, so they can be picked. */
  workingSundays?: string[];
  defaultValue?: string;
  className?: string;
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, "id" | "name" | "required" | "min" | "max" | "aria-label">) {
  const [problem, setProblem] = useState("");
  const check = (el: HTMLInputElement) => {
    const v = el.value;
    const why = !v ? "" : !allowSunday && isSunday(v) && !workingSundays.includes(v) ? "That's a Sunday. Pick a working day." : holidays[v] ? `That's a holiday (${holidays[v]}). Pick another day.` : "";
    el.setCustomValidity(why);
    setProblem(why);
  };
  return (
    <>
      <input
        type="date"
        defaultValue={defaultValue}
        className={className}
        aria-invalid={problem ? true : undefined}
        onChange={(e) => check(e.currentTarget)}
        onBlur={(e) => check(e.currentTarget)}
        {...rest}
      />
      {problem && (
        <span role="alert" className="mt-1 block text-xs font-medium text-red-700 dark:text-red-300">
          {problem}
        </span>
      )}
    </>
  );
}
