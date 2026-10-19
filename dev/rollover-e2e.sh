#!/bin/bash
# SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# End-to-end check of the nightly rollover job on the PostgreSQL test server
# (dev/server.sh --package, port 8092), with the app's current lib/ and
# appinfo/ copied in:
#
#   dev/rollover-e2e.sh
#
# Seeds overdue tasks for admin (time zone America/Phoenix) and one in a list
# bob shares with admin, runs the job with occ, and checks what the server
# stored. Prints PASS/FAIL per check; exits non-zero on any FAIL.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
C=tasks-pkg
BASE=http://localhost:8092/remote.php/dav/calendars
ZONE=America/Phoenix
FAILS=0

occ() { docker exec -u www-data "$C" php occ "$@"; }
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (expected '$3', got '$2')"; fi; }

# Dates in Phoenix local time (UTC-7, no daylight saving), as the job sees them
day() { TZ=$ZONE date -v"${1}d" +%Y%m%d; }
utc() { TZ=$ZONE date -v"${1}d" -v"${2}H" -v0M -v0S +%s | xargs -I{} date -u -r {} +%Y%m%dT%H%M%SZ; }

put() { # user, password, calendar, uid, lines...
	local user=$1 pass=$2 cal=$3 uid=$4; shift 4
	{ printf 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//tasks-fork//e2e//EN\r\nBEGIN:VTODO\r\n'
	  printf 'UID:%s\r\nDTSTAMP:20261001T120000Z\r\nSUMMARY:%s\r\n' "$uid" "$uid"
	  for l in "$@"; do printf '%s\r\n' "$l"; done
	  printf 'END:VTODO\r\nEND:VCALENDAR\r\n'; } |
	curl -s -u "$user:$pass" -X PUT "$BASE/$user/$cal/$uid.ics" -H 'Content-Type: text/calendar' \
		--data-binary @- -o /dev/null -w '%{http_code}' | grep -qE '^20[14]$' || fail "seed $uid"
}
prop() { # user, password, calendar, uid, property name -> its first value line
	curl -s -u "$1:$2" "$BASE/$1/$3/$4.ics" | tr -d '\r' | grep -E "^$5[;:]" | head -1
}
etag() { curl -s -u "$1:$2" -I "$BASE/$1/$3/$4.ics" | tr -d '\r' | grep -i '^etag' ; }
alarm() { printf 'BEGIN:VALARM\nACTION:DISPLAY\nDESCRIPTION:R\nTRIGGER;VALUE=DATE-TIME:%s\nEND:VALARM' "$1"; }

echo "== deploy lib/ and appinfo/ to $C"
docker exec "$C" rm -rf /var/www/html/custom_apps/tasks/lib /var/www/html/custom_apps/tasks/appinfo
docker cp "$REPO/lib" "$C":/var/www/html/custom_apps/tasks/lib
docker cp "$REPO/appinfo" "$C":/var/www/html/custom_apps/tasks/appinfo
docker exec "$C" chown -R www-data:www-data /var/www/html/custom_apps/tasks
occ app:disable tasks > /dev/null; occ app:enable tasks > /dev/null
occ upgrade > /dev/null 2>&1 || true
JOB=$(occ background-job:list --class='OCA\Tasks\BackgroundJob\RolloverJob' --output=json 2>/dev/null | python3 -c 'import json,sys; j=json.load(sys.stdin); print(j[0]["id"] if j else "")' 2>/dev/null)
[ -n "$JOB" ] && pass "the job is registered (id $JOB)" || { fail "the job is registered"; exit 1; }

echo "== seed"
occ user:setting admin core timezone "$ZONE" > /dev/null
occ user:setting admin tasks various_rollover 1 > /dev/null
OC_PASS=bobpass123x docker exec -e OC_PASS=bobpass123x -u www-data "$C" php occ user:add --password-from-env bob > /dev/null 2>&1 || true
occ user:setting bob tasks various_rollover 0 > /dev/null
for who in admin:admin bob:bobpass123x; do
	u=${who%%:*}; p=${who#*:}
	curl -s -u "$u:$p" -X MKCALENDAR "$BASE/$u/rollover-e2e/" -H 'Content-Type: application/xml' --data \
		'<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop><d:displayname>Rollover e2e</d:displayname><c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>' -o /dev/null
done
curl -s -u bob:bobpass123x -X POST "$BASE/bob/rollover-e2e/" -H 'Content-Type: application/xml' --data \
	'<o:share xmlns:d="DAV:" xmlns:o="http://owncloud.org/ns"><o:set><d:href>principal:principals/users/admin</d:href><o:read-write>true</o:read-write></o:set></o:share>' -o /dev/null

put admin admin rollover-e2e timed "DUE:$(utc -1 16)"
put admin admin rollover-e2e allday "DUE;VALUE=DATE:$(day -2)"
put admin admin rollover-e2e reminder "$(alarm "$(utc -1 9)")"
put admin admin rollover-e2e weekly-old "DUE:$(utc -9 9)" "RRULE:FREQ=WEEKLY;COUNT=5"
put admin admin rollover-e2e weekly-recent "DUE:$(utc -2 9)" "RRULE:FREQ=WEEKLY"
put admin admin rollover-e2e done "DUE:$(utc -1 16)" "STATUS:COMPLETED"
# Rolled yesterday, then completed on the phone: the next occurrence is today, the count was kept
put admin admin rollover-e2e phone-done "DUE:$(utc +0 9)" "RRULE:FREQ=DAILY" "X-NEXTCLOUD-TASKS-MISSED:3" "X-NEXTCLOUD-TASKS-ROLLED-TO:$(utc -1 9)"
put bob bobpass123x rollover-e2e bobs "DUE:$(utc -1 16)"

echo "== run"
occ user:setting admin tasks rollover_last_date --delete > /dev/null 2>&1
occ background-job:execute "$JOB" --force-execute > /dev/null

check "timed task moves to today, same time" "$(prop admin admin rollover-e2e timed DUE)" "DUE:$(utc +0 16)"
check "timed task keeps its original due date" "$(prop admin admin rollover-e2e timed X-NEXTCLOUD-TASKS-ORIGINAL-DUE)" "X-NEXTCLOUD-TASKS-ORIGINAL-DUE:$(utc -1 16)"
check "all-day task moves to today, still all-day" "$(prop admin admin rollover-e2e allday DUE)" "DUE;VALUE=DATE:$(day +0)"
check "reminder-only task: reminder lands today" "$(prop admin admin rollover-e2e reminder TRIGGER)" "TRIGGER;VALUE=DATE-TIME:$(utc +0 9)"
check "reminder-only task keeps its original reminder" "$(prop admin admin rollover-e2e reminder X-NEXTCLOUD-TASKS-ORIGINAL-REMINDER)" "X-NEXTCLOUD-TASKS-ORIGINAL-REMINDER:$(utc -1 9)"
check "weekly task jumps to its latest occurrence" "$(prop admin admin rollover-e2e weekly-old DUE)" "DUE:$(utc -2 9)"
check "weekly task counts the missed one" "$(prop admin admin rollover-e2e weekly-old X-NEXTCLOUD-TASKS-MISSED)" "X-NEXTCLOUD-TASKS-MISSED:1"
check "weekly task records the date it was left on" "$(prop admin admin rollover-e2e weekly-old X-NEXTCLOUD-TASKS-ROLLED-TO)" "X-NEXTCLOUD-TASKS-ROLLED-TO:$(utc -2 9)"
check "completed on the phone onto today: the count goes" "$(prop admin admin rollover-e2e phone-done X-NEXTCLOUD-TASKS-MISSED)" ""
check "completed on the phone onto today: the date stays" "$(prop admin admin rollover-e2e phone-done DUE)" "DUE:$(utc +0 9)"
check "weekly task uses up COUNT" "$(prop admin admin rollover-e2e weekly-old RRULE)" "RRULE:FREQ=WEEKLY;COUNT=4"
check "weekly task within its week stays put" "$(prop admin admin rollover-e2e weekly-recent DUE)" "DUE:$(utc -2 9)"
check "completed task stays put" "$(prop admin admin rollover-e2e done DUE)" "DUE:$(utc -1 16)"
check "list shared with admin is not admin's to roll" "$(prop bob bobpass123x rollover-e2e bobs DUE)" "DUE:$(utc -1 16)"
check "today is recorded as done" "$(occ user:setting admin tasks rollover_last_date)" "$(TZ=$ZONE date +%Y-%m-%d)"

echo "== run again"
BEFORE="$(etag admin admin rollover-e2e timed) $(etag admin admin rollover-e2e weekly-old)"
occ background-job:execute "$JOB" --force-execute > /dev/null
check "same night, guarded by the date: nothing written" "$(etag admin admin rollover-e2e timed) $(etag admin admin rollover-e2e weekly-old)" "$BEFORE"
occ user:setting admin tasks rollover_last_date --delete > /dev/null 2>&1
occ background-job:execute "$JOB" --force-execute > /dev/null
check "same night, guard cleared: still nothing written" "$(etag admin admin rollover-e2e timed) $(etag admin admin rollover-e2e weekly-old)" "$BEFORE"

echo "== a list in the trash"
curl -s -u admin:admin -X MKCALENDAR "$BASE/admin/rollover-trash/" -H 'Content-Type: application/xml' --data \
	'<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop><d:displayname>Rollover trash</d:displayname><c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>' -o /dev/null
put admin admin rollover-trash trashed "DUE:$(utc -1 16)"
curl -s -u admin:admin -X DELETE "$BASE/admin/rollover-trash/" -o /dev/null
occ user:setting admin tasks rollover_last_date --delete > /dev/null 2>&1
occ background-job:execute "$JOB" --force-execute > /dev/null
TRASHED=$(docker exec tasks-pkg-db psql -U nextcloud -d nextcloud -tAc "select convert_from(calendardata, 'UTF8') from oc_calendarobjects where uid = 'trashed'" | tr -d '\r' | grep -E '^DUE[;:]' | head -1)
check "a list in the trash is not rolled" "$TRASHED" "DUE:$(utc -1 16)"

echo "== no time zone of their own: the server's default"
occ config:system:set default_timezone --value="$ZONE" > /dev/null
occ user:setting admin core timezone --delete > /dev/null 2>&1
# 23:30 yesterday in Phoenix is already today in UTC
LATE=$(TZ=$ZONE date -v-1d -v23H -v30M -v0S +%s | xargs -I{} date -u -r {} +%Y%m%dT%H%M%SZ)
LATE_TODAY=$(TZ=$ZONE date -v23H -v30M -v0S +%s | xargs -I{} date -u -r {} +%Y%m%dT%H%M%SZ)
put admin admin rollover-e2e late-evening "DUE:$LATE"
occ user:setting admin tasks rollover_last_date --delete > /dev/null 2>&1
occ background-job:execute "$JOB" --force-execute > /dev/null
check "rolled by the server's default zone, not UTC" "$(prop admin admin rollover-e2e late-evening DUE)" "DUE:$LATE_TODAY"
occ user:setting admin core timezone "$ZONE" > /dev/null
occ config:system:delete default_timezone > /dev/null

echo "== switched off"
put admin admin rollover-e2e off "DUE:$(utc -1 16)"
occ user:setting admin tasks various_rollover 0 > /dev/null
occ user:setting admin tasks rollover_last_date --delete > /dev/null 2>&1
occ background-job:execute "$JOB" --force-execute > /dev/null
check "with the setting off nothing rolls" "$(prop admin admin rollover-e2e off DUE)" "DUE:$(utc -1 16)"
occ user:setting admin tasks various_rollover 1 > /dev/null

echo
[ "$FAILS" -eq 0 ] && echo "all checks passed" || echo "$FAILS check(s) failed"
exit "$FAILS"
