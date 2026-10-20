export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordRules = [
  { id: "length", label: "8–128 characters", test: (value: string) => value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH },
  { id: "uppercase", label: "At least one uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { id: "lowercase", label: "At least one lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { id: "number", label: "At least one number", test: (value: string) => /[0-9]/.test(value) },
];

export function passwordError(value: string) {
  const unmet = passwordRules.filter((rule) => !rule.test(value));
  return unmet.length ? `Password requirements not met: ${unmet.map((rule) => rule.label).join("; ")}.` : undefined;
}
