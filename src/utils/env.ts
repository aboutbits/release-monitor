type EnvVarName = keyof typeof process.env

export function requiredString(name: EnvVarName): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

export function positiveInt(name: EnvVarName, defaultValue: number): number {
  const raw = process.env[name]
  if (!raw) {
    return defaultValue
  }

  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`)
  }

  return value
}

export function timeZone(name: EnvVarName, defaultValue: string): string {
  const value = process.env[name]
  if (!value) {
    return defaultValue
  }

  try {
    Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions()
  } catch {
    throw new Error(
      `${name} must be an IANA time zone, for example "Europe/Rome", got "${value}"`,
    )
  }

  return value
}
