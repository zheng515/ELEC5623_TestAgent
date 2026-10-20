// The exact-threshold defect is intentional for the verification demo.
export function fee(amount) {
  return amount > 10000 ? 0 : 1000;
}
