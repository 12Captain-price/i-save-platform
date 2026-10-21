// Failure diagnostics must never emit cookies, bearer tokens or setup URLs.
function safe(value = "") {
  return value
    .replace(/(?:cookie|authorization):[^\r\n]*/gi, "[private header redacted]")
    .replace(/isave_session=[^\s;"']+/g, "isave_session=[redacted]")
    .replace(/(?:https?:\/\/[^\s"']*setup-password)[^\s"']*/g, "[private setup URL redacted]")
    .replace(/("?(?:password|access_token)"?\s*[:=]\s*)[^\r\n,}]+/gi, "$1[redacted]");
}
module.exports = class {
  onBegin(_config, suite) {
    this.counts = {};
    console.log("Browser cases: " + suite.allTests().length);
  }
  onTestEnd(test, result) {
    this.counts[result.status] = (this.counts[result.status] ?? 0) + 1;
    console.log(result.status + ": " + test.title);
    for (const error of result.errors ?? []) console.log(safe(error.message));
  }
  onEnd(result) {
    console.log(JSON.stringify({ status: result.status, counts: this.counts }));
  }
};
