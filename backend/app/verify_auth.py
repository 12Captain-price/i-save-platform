"""Privately verify the running local API; print/save status checks, never secrets.

Run in your own terminal: docker compose exec backend python -m app.verify_auth
"""
import json
import os
from pathlib import Path
import sys

import httpx

from app.security.auth import now
from app.security.console import private_input

REPORT = Path("/tmp/isave-auth-verification.json")


def verify(client, email, password):
    checks = []
    tokens = []

    def expect(name, response, status):
        checks.append({"check": name, "actual": response.status_code, "expected": status,
                       "passed": response.status_code == status})
        if response.status_code != status:
            raise RuntimeError("HTTP check failed")
        return response

    def login():
        response = expect("login", client.post("/api/v1/auth/login", json={"email":email,"password":password}), 200)
        token = response.json()["access_token"]
        tokens.append(token)
        return {"Authorization":"Bearer " + token}

    result = {"started_at": now().isoformat(), "checks":checks, "passed":False}
    try:
        expect("readiness", client.get("/ready"), 200)
        expect("anonymous_private_access_denied", client.get("/api/v1/members"), 401)
        expect("invalid_session_denied", client.get("/api/v1/members", headers={"Authorization":"Bearer invalid"}), 401)
        first = login()
        second = login()
        me = expect("authenticated_identity", client.get("/api/v1/auth/me", headers=first), 200).json()
        user_id = me["user"]["id"]
        if not {"users:write","roles:write"} <= set(me["permissions"]):
            raise RuntimeError("Use the initial administrator for this verification")
        expect("authenticated_member_reads", client.get("/api/v1/members", headers=first), 200)
        expect("admin_self_deactivation_denied", client.patch(f"/api/v1/users/{user_id}", headers=first, json={"is_active":False}), 403)
        expect("logout", client.post("/api/v1/auth/logout", headers=first), 204)
        expect("logged_out_token_denied", client.get("/api/v1/auth/me", headers=first), 401)
        expect("other_session_remains_valid", client.get("/api/v1/auth/me", headers=second), 200)
        third = login()
        expect("revoke_all_sessions", client.delete(f"/api/v1/users/{user_id}/sessions", headers=second), 204)
        expect("revoking_session_denied", client.get("/api/v1/auth/me", headers=second), 401)
        expect("other_revoked_session_denied", client.get("/api/v1/auth/me", headers=third), 401)
        result["passed"] = True
    except Exception:
        # Do not print exception/HTTP bodies: they could contain credentials.
        result["error"] = "Verification failed; review status checks and retry privately."
    finally:
        for token in tokens:
            try:
                client.post("/api/v1/auth/logout", headers={"Authorization":"Bearer " + token})
            except Exception:
                result["cleanup_warning"] = "Session cleanup could not be confirmed; revoke sessions before continuing."
        tokens.clear()
    result["finished_at"] = now().isoformat()
    return result


def main():
    # Invalidate any old report before asking for private input.
    os.umask(0o077)
    REPORT.write_text(json.dumps({"passed":False,"state":"awaiting_private_input","started_at":now().isoformat()}))
    try:
        email = private_input("Administrator email (hidden): ")
        password = private_input("Administrator password (hidden): ")
        # Fixed loopback target; never transmit credentials to redirects/proxies.
        with httpx.Client(base_url="http://127.0.0.1:8000", trust_env=False,
                          follow_redirects=False, timeout=15) as client:
            result = verify(client, email, password)
    except (Exception, KeyboardInterrupt):
        result = {"passed":False,"error":"Private verification could not finish.","finished_at":now().isoformat()}
    REPORT.write_text(json.dumps(result, indent=2))
    for check in result.get("checks", []):
        print(f"{check['check']}: HTTP {check['actual']} ({'PASS' if check['passed'] else 'FAIL'})")
    print("Authentication verification " + ("PASSED" if result["passed"] else "FAILED"))
    sys.exit(0 if result["passed"] else 1)


if __name__ == "__main__":
    main()
