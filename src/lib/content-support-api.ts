export async function contentSupportApi(path: string, body?: unknown) {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Isave-Request": "1" },
          body: JSON.stringify(body),
        },
  );
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    const data = type.includes("json") ? await response.json().catch(() => ({})) : {};
    throw Error(
      typeof data.error === "string"
        ? data.error
        : (data.error?.message ?? "Unable to complete the request. Refresh before retrying."),
    );
  }
  return response.json();
}
export type PublicContent = {
  item_id: number;
  kind: string;
  version: number;
  fields: {
    title: string;
    body: string;
    team_role: string;
    location: string;
    event_status: string;
    starts_at: string | null;
    ends_at: string | null;
    media_id: number | null;
  };
  media: { id: number; alt: string } | null;
  effective_at: string;
};
export function harareDate(value: string) {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Harare",
    }).format(new Date(value)) + " Harare"
  );
}
export function officeInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw Error("Enter a valid date and time in Harare (UTC+02:00).");
  const date = new Date(value + ":00+02:00");
  if (
    !Number.isFinite(date.getTime()) ||
    new Date(date.getTime() + 7200000).toISOString().slice(0, 16) !== value
  )
    throw Error("Enter a valid Harare date and time.");
  return date.toISOString();
}
