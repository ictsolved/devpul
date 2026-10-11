import { type DevEvent, type Json, str } from './events';

export function sessionFields(e: DevEvent | undefined): [string, Json][] {
  if (!e) return [];
  return Object.entries(e.data);
}

export function appName(session: DevEvent | undefined): string | undefined {
  if (!session) return undefined;
  const d = session.data;
  return (
    str(d.name) ??
    str(d.app) ??
    sessionFields(session)
      .map(([, v]) => str(v))
      .find(Boolean)
  );
}
