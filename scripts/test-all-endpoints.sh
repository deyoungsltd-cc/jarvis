#!/bin/bash
# Live API test suite for OpenJARVIS
BASE="http://localhost:3099"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name (expected '$expected', got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== 1. Health Check ==="
R=$(curl -s $BASE/api/health)
check "Health returns ok" '"status":"ok"' "$R"
echo "  Response: $R"
echo

echo "=== 2. Validate Invite Key (correct key) ==="
R=$(curl -s -X POST $BASE/api/auth/validate-key -H 'Content-Type: application/json' -d '{"inviteKey":"82011D70A4DF6C5B"}')
check "Valid key accepted" '"valid":true' "$R"
echo "  Response: $R"
echo

echo "=== 3. Validate Invite Key (wrong key) ==="
R=$(curl -s -X POST $BASE/api/auth/validate-key -H 'Content-Type: application/json' -d '{"inviteKey":"WRONGKEY123"}')
check "Invalid key rejected" '"Invalid invite key"' "$R"
echo "  Response: $R"
echo

echo "=== 4. Validate Invite Key (lowercase) ==="
R=$(curl -s -X POST $BASE/api/auth/validate-key -H 'Content-Type: application/json' -d '{"inviteKey":"82011d70a4df6c5b"}')
check "Lowercase key works" '"valid":true' "$R"
echo "  Response: $R"
echo

echo "=== 5. Validate Invite Key (empty) ==="
R=$(curl -s -X POST $BASE/api/auth/validate-key -H 'Content-Type: application/json' -d '{"inviteKey":""}')
check "Empty key rejected" '"Invite key is required"' "$R"
echo "  Response: $R"
echo

echo "=== 6. Register (valid data) ==="
R=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' -d '{"name":"Test User","email":"testuser@example.com","password":"testpass123","confirmPassword":"testpass123","inviteKey":"82011D70A4DF6C5B"}')
check "Registration succeeds" '"role":"user"' "$R"
echo "  Response: $R"
echo

echo "=== 7. Register (duplicate email) ==="
R=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' -d '{"name":"Test User 2","email":"testuser@example.com","password":"testpass123","confirmPassword":"testpass123","inviteKey":"82011D70A4DF6C5B"}')
check "Duplicate rejected" '"already exists"' "$R"
echo "  Response: $R"
echo

echo "=== 8. Register (bad password match) ==="
R=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' -d '{"name":"Bad","email":"bad@example.com","password":"testpass123","confirmPassword":"different","inviteKey":"82011D70A4DF6C5B"}')
check "Password mismatch rejected" '"Passwords do not match"' "$R"
echo "  Response: $R"
echo

echo "=== 9. Unauthenticated access to protected route ==="
R=$(curl -s $BASE/api/missions)
check "Unauth returns 401" 'Unauthorized' "$R"
echo "  Response: $R"
echo

echo "=== 10. Unauthenticated access to admin route ==="
R=$(curl -s $BASE/api/admin/users)
check "Admin unauth returns 401" 'Unauthorized' "$R"
echo "  Response: $R"
echo

echo "=== 11. Login page loads ==="
R=$(curl -s -o /dev/null -w '%{http_code}' $BASE/login)
check "Login page 200" '200' "$R"
echo "  Status: $R"
echo

echo "=== 12. Admin page redirects when not logged in ==="
R=$(curl -s -o /dev/null -w '%{http_code}' $BASE/admin)
check "Admin page returns 200 (shows access denied)" '200' "$R"
echo "  Status: $R"
echo

echo "=== 13. Register page redirects ==="
R=$(curl -s -o /dev/null -w '%{http_code}' $BASE/register)
check "Register page 200" '200' "$R"
echo "  Status: $R"
echo

echo "=== 14. Main page loads ==="
R=$(curl -s -o /dev/null -w '%{http_code}' $BASE/)
check "Main page 200" '200' "$R"
echo "  Status: $R"
echo

echo "========================================"
echo "RESULTS: $PASS passed, $FAIL failed"
if [ $FAIL -eq 0 ]; then echo "ALL TESTS PASSED"; else echo "SOME TESTS FAILED"; fi
echo "========================================"
