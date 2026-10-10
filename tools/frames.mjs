const REPO = "wenxiuncle/Sitopia";
const WORKFLOW = "refresh-frames.yml";
const REF = "main";

function headers(token) {
  const out = {
    accept: "application/vnd.github+json",
    "user-agent": "sitopia-admin",
    "x-github-api-version": "2022-11-28",
  };
  if (token) out.authorization = "Bearer " + token;
  return out;
}

async function github(token, path, init) {
  return fetch("https://api.github.com" + path, {
    method: init && init.method ? init.method : "GET",
    headers: headers(token),
    body: init && init.body ? init.body : undefined,
  });
}

async function failedStep(token, id) {
  try {
    const res = await github(token, "/repos/" + REPO + "/actions/runs/" + id + "/jobs");
    if (!res.ok) return "";
    const data = await res.json();
    const jobs = data && data.jobs ? data.jobs : [];
    for (let j = 0; j < jobs.length; j++) {
      const steps = jobs[j].steps || [];
      for (let s = 0; s < steps.length; s++) {
        if (steps[s].conclusion === "failure") return String(steps[s].name || "");
      }
    }
  } catch {
    return "";
  }
  return "";
}

export async function frameStatus(token) {
  const report = {
    token: !!token,
    status: "none",
    at: "",
    count: null,
    missingPortal: null,
    reason: "",
    url: "",
  };
  try {
    const metaRes = await fetch(
      "https://raw.githubusercontent.com/" + REPO + "/" + REF + "/data/refresh.json?t=" + Date.now(),
      { headers: { "user-agent": "sitopia-admin" } },
    );
    if (metaRes.ok) {
      const meta = await metaRes.json();
      if (meta && Number.isFinite(Number(meta.count))) report.count = Number(meta.count);
      if (meta && Number.isFinite(Number(meta.missingPortal))) report.missingPortal = Number(meta.missingPortal);
    }
  } catch {
    /* 件数读不到就只显示这次抓取走到哪。 */
  }
  let res;
  try {
    res = await github(token, "/repos/" + REPO + "/actions/workflows/" + WORKFLOW + "/runs?per_page=1");
  } catch {
    report.reason = "network";
    return report;
  }
  if (res.status === 404) {
    report.reason = "missing";
    return report;
  }
  if (!res.ok) {
    report.reason = "github";
    return report;
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    report.reason = "github";
    return report;
  }
  const run = data && data.workflow_runs && data.workflow_runs[0];
  if (!run) return report;
  report.url = typeof run.html_url === "string" ? run.html_url : "";
  report.at = run.updated_at || run.run_started_at || "";
  report.title = typeof run.display_title === "string" ? run.display_title : "";
  if (run.status === "queued" || run.status === "waiting" || run.status === "pending") report.status = "queued";
  else if (run.status !== "completed") report.status = "running";
  else if (run.conclusion === "success") report.status = "success";
  else if (run.conclusion === "cancelled") report.status = "cancelled";
  else {
    report.status = "failure";
    report.reason = await failedStep(token, run.id);
  }
  return report;
}

export function fetchedToday(report, now) {
  if (!report) return false;
  if (report.status !== "success" && report.status !== "running" && report.status !== "queued") return false;
  const ms = Date.parse(report.at || "");
  if (Number.isNaN(ms)) return false;
  const at = typeof now === "number" ? now : Date.now();
  const day = (t) => new Date(t + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return day(ms) === day(at);
}

export async function frameDispatch(token, full) {
  if (!token) return { error: "unset" };
  const body = { ref: REF };
  if (full) body.inputs = { full: "true" };
  let res;
  try {
    res = await github(token, "/repos/" + REPO + "/actions/workflows/" + WORKFLOW + "/dispatches", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch {
    return { error: "network" };
  }
  if (res.status === 204) return { ok: true };
  if (res.status === 401 || res.status === 403) return { error: "denied" };
  if (res.status === 404) return { error: "missing" };
  return { error: "github" };
}
