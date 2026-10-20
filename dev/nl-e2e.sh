#!/bin/bash
# SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# End-to-end check of reading new tasks on arrival and of the parse endpoint
# on the PostgreSQL test server (dev/server.sh --package, port 8092), with the
# app's current lib/ and appinfo/ copied in:
#
#   dev/nl-e2e.sh
#
# Creates tasks for admin (time zone America/Phoenix) over CalDAV the way an
# agent or the phone does, and checks what the server stored; then checks the
# requests that must be left alone, the setting, a user without Tasks, and
# POST /apps/tasks/api/v1/parse. Prints PASS/FAIL per check; exits non-zero
# on any FAIL. On any exit, interrupted too, it puts admin's settings back as
# it found them, opens Tasks to everyone again, and removes the user, group,
# tasks and file it adds, bypassing the trash bins. The nl-e2e list stays:
# Nextcloud limits each user to 10 new calendars an hour.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
C=tasks-pkg
HOST=http://localhost:8092
BASE=$HOST/remote.php/dav/calendars
ZONE=America/Phoenix
LIST=nl-e2e
RUN=$(date +%s)
# A new user each run: the calendar limit counts by user id, deleted or not
U=nle2e$RUN; P=nle2epass123x$RUN; G=nl-e2e-tasks
FILE=$HOST/remote.php/dav/files/admin/nl-e2e.txt
HDRS=$(mktemp)
FAILS=0
SETUP=0

occ() { docker exec -u www-data "$C" php occ "$@"; }
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (expected '$3', got '$2')"; fi; }

# Phoenix local time (UTC-7, no daylight saving) as UTC: days from today, hour
utc() { TZ=$ZONE date -v"${1}d" -v"${2}H" -v0M -v0S +%s | xargs -I{} date -u -r {} +%Y%m%dT%H%M%SZ; }
now() { date -u +%Y%m%dT%H%M%SZ; }

vtodo() { # uid, summary, extra lines...
	local uid=$1 summary=$2; shift 2
	printf 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//tasks-fork//nl-e2e//EN\r\nBEGIN:VTODO\r\n'
	printf 'UID:%s\r\nDTSTAMP:%s\r\nSUMMARY:%s\r\nSTATUS:NEEDS-ACTION\r\n' "$uid" "$(now)" "$summary"
	for l in "$@"; do printf '%s\r\n' "$l"; done
	printf 'END:VTODO\r\nEND:VCALENDAR\r\n'
}
put() { # user, password, calendar, uid, [extra curl args...]; body on stdin -> status code; headers in $HDRS
	local user=$1 pass=$2 cal=$3 uid=$4; shift 4
	curl -s -u "$user:$pass" -X PUT "$BASE/$user/$cal/$uid.ics" -H 'Content-Type: text/calendar' "$@" \
		--data-binary @- -D "$HDRS" -o /dev/null -w '%{http_code}'
}
has_etag() { tr -d '\r' < "$HDRS" | grep -qi '^etag:' && echo yes || echo no; }
prop() { # user, password, calendar, uid, property name -> its first line, unfolded
	curl -s -u "$1:$2" "$BASE/$1/$3/$4.ics" | tr -d '\r' | perl -0pe 's/\n[ \t]//g' | grep -E "^$5[;:]" | head -1
}
mklist() { # user, password, list; only when missing, as each creation counts against a limit
	[ "$(curl -s -u "$1:$2" -X PROPFIND "$BASE/$1/$3/" -H 'Depth: 0' -o /dev/null -w '%{http_code}')" = 207 ] && return
	curl -s -u "$1:$2" -X MKCALENDAR "$BASE/$1/$3/" -H 'Content-Type: application/xml' --data \
		'<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop><d:displayname>NL e2e</d:displayname><c:supported-calendar-component-set><c:comp name="VTODO"/><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>' -o /dev/null
}
parse() { # JSON body -> the response, one key=value per line
	curl -s -u admin:admin -X POST "$HOST/index.php/apps/tasks/api/v1/parse" \
		-H 'OCS-APIRequest: true' -H 'Content-Type: application/json' --data "$1" |
		python3 -c 'import json,sys
try:
	j = json.load(sys.stdin)
except Exception:
	print("not json"); sys.exit()
for k, v in j.items(): print(f"{k}={json.dumps(v)}")'
}
field() { grep "^$2=" <<< "$1" | cut -d= -f2-; }
initial_state() { # the page's parseNewTasks initial state, decoded
	curl -s -u admin:admin "$HOST/index.php/apps/tasks/" |
		grep -o 'id="initial-state-tasks-parseNewTasks" value="[^"]*"' | sed 's/.*value="//; s/"$//' | base64 -d 2>/dev/null
}

restore() {
	rm -f "$HDRS"
	[ "$SETUP" = 1 ] || return 0
	echo "== restore"
	occ app:enable tasks > /dev/null
	if [ "$HAD_ZONE" = 1 ]; then occ user:setting admin core timezone "$SAVED_ZONE" > /dev/null
	else occ user:setting admin core timezone --delete > /dev/null 2>&1; fi
	if [ "$HAD_SETTING" = 1 ]; then occ user:setting admin tasks various_parseNewTasks "$SAVED_SETTING" > /dev/null
	else occ user:setting admin tasks various_parseNewTasks --delete > /dev/null 2>&1; fi
	occ user:delete "$U" > /dev/null 2>&1
	occ group:delete "$G" > /dev/null 2>&1
	# This run's tasks, past the calendar trash bin
	curl -s -u admin:admin -X PROPFIND "$BASE/admin/$LIST/" -H 'Depth: 1' |
		grep -o "<d:href>[^<]*-$RUN\.ics</d:href>" | sed 's/<d:href>//; s/<\/d:href>//' |
		while read -r href; do curl -s -u admin:admin -X DELETE "$HOST$href" -H 'X-NC-CalDAV-No-Trashbin: 1' -o /dev/null; done
	# The uploaded file, then its copies in the files trash bin (this run's and any earlier one's)
	curl -s -u admin:admin -X DELETE "$FILE" -o /dev/null
	curl -s -u admin:admin -X PROPFIND "$HOST/remote.php/dav/trashbin/admin/trash/" -H 'Depth: 1' |
		grep -o '<d:href>[^<]*/trash/nl-e2e\.txt\.d[0-9]*</d:href>' | sed 's/<d:href>//; s/<\/d:href>//' |
		while read -r href; do curl -s -u admin:admin -X DELETE "$HOST$href" -o /dev/null; done
	SETUP=0
}
trap restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

SENTENCE='Purchase milk at the grocery store tomorrow evening'
EVENING=$(utc +1 18)

echo "== deploy lib/ and appinfo/ to $C"
docker exec "$C" rm -rf /var/www/html/custom_apps/tasks/lib /var/www/html/custom_apps/tasks/appinfo
docker cp "$REPO/lib" "$C":/var/www/html/custom_apps/tasks/lib
docker cp "$REPO/appinfo" "$C":/var/www/html/custom_apps/tasks/appinfo
docker exec "$C" chown -R www-data:www-data /var/www/html/custom_apps/tasks
occ app:disable tasks > /dev/null; occ app:enable tasks > /dev/null
occ upgrade > /dev/null 2>&1 || true
# Apache's APCu holds the routes for an hour, keyed by version: a new route
# needs a fresh cache
docker exec "$C" apachectl -k graceful 2> /dev/null
sleep 2

echo "== setup"
# occ prints "does not exist" on stdout: only its exit status tells
if SAVED_ZONE=$(occ user:setting admin core timezone 2>/dev/null); then HAD_ZONE=1; else HAD_ZONE=0; fi
if SAVED_SETTING=$(occ user:setting admin tasks various_parseNewTasks 2>/dev/null); then HAD_SETTING=1; else HAD_SETTING=0; fi
SETUP=1
occ user:setting admin core timezone "$ZONE" > /dev/null
occ user:setting admin tasks various_parseNewTasks --delete > /dev/null 2>&1
mklist admin admin "$LIST"

echo "== a new task from an agent"
CODE=$(vtodo "milk-$RUN" "$SENTENCE" | put admin admin "$LIST" "milk-$RUN")
check "created" "$CODE" "201"
check "modified on arrival: no ETag" "$(has_etag)" "no"
check "the date words leave the title" "$(prop admin admin $LIST "milk-$RUN" SUMMARY)" "SUMMARY:Purchase milk at the grocery store"
check "due tomorrow evening" "$(prop admin admin $LIST "milk-$RUN" DUE)" "DUE:$EVENING"
check "the place is the location" "$(prop admin admin $LIST "milk-$RUN" LOCATION)" "LOCATION:grocery store"
check "the reminder at the due time" "$(prop admin admin $LIST "milk-$RUN" TRIGGER)" "TRIGGER;VALUE=DATE-TIME:$EVENING"
check "the reminder is tagged automatic" "$(prop admin admin $LIST "milk-$RUN" X-NEXTCLOUD-TASKS-AUTOMATIC)" "X-NEXTCLOUD-TASKS-AUTOMATIC:1"
check "the sentence is kept for Undo" "$(prop admin admin $LIST "milk-$RUN" X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY)" "X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY;VALUE=TEXT:$SENTENCE"
check "what was filled is listed" "$(prop admin admin $LIST "milk-$RUN" X-NEXTCLOUD-TASKS-FILLED)" "X-NEXTCLOUD-TASKS-FILLED:DUE,LOCATION"

echo "== a new task with a due date and no reminder"
DUE=$(utc +2 15)
vtodo "dated-$RUN" "Call Sam" "DUE:$DUE" | put admin admin "$LIST" "dated-$RUN" > /dev/null
check "the due date is the sender's" "$(prop admin admin $LIST "dated-$RUN" DUE)" "DUE:$DUE"
check "the reminder is added at the due time" "$(prop admin admin $LIST "dated-$RUN" TRIGGER)" "TRIGGER;VALUE=DATE-TIME:$DUE"
check "the added reminder is tagged automatic" "$(prop admin admin $LIST "dated-$RUN" X-NEXTCLOUD-TASKS-AUTOMATIC)" "X-NEXTCLOUD-TASKS-AUTOMATIC:1"
check "the title stays" "$(prop admin admin $LIST "dated-$RUN" SUMMARY)" "SUMMARY:Call Sam"

echo "== requests left alone"
CODE=$(vtodo "web-$RUN" "$SENTENCE" | put admin admin "$LIST" "web-$RUN" -H 'X-Nextcloud-Tasks-Client: web')
check "from the web app: created" "$CODE" "201"
check "from the web app: ETag present" "$(has_etag)" "yes"
check "from the web app: title as sent" "$(prop admin admin $LIST "web-$RUN" SUMMARY)" "SUMMARY:$SENTENCE"
check "from the web app: no due date" "$(prop admin admin $LIST "web-$RUN" DUE)" ""

vtodo "update-$RUN" "Update me" | put admin admin "$LIST" "update-$RUN" > /dev/null
CODE=$(vtodo "update-$RUN" "$SENTENCE" | put admin admin "$LIST" "update-$RUN")
check "an update: saved" "$CODE" "204"
check "an update: title as sent" "$(prop admin admin $LIST "update-$RUN" SUMMARY)" "SUMMARY:$SENTENCE"
check "an update: no due date" "$(prop admin admin $LIST "update-$RUN" DUE)" ""

{ printf 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//tasks-fork//nl-e2e//EN\r\nBEGIN:VEVENT\r\n'
  printf 'UID:event-%s\r\nDTSTAMP:%s\r\nDTSTART:%s\r\nDTEND:%s\r\nSUMMARY:%s\r\n' "$RUN" "$(now)" "$(utc +3 12)" "$(utc +3 13)" "$SENTENCE"
  printf 'END:VEVENT\r\nEND:VCALENDAR\r\n'; } | put admin admin "$LIST" "event-$RUN" > /dev/null
check "an event: title as sent" "$(prop admin admin $LIST "event-$RUN" SUMMARY)" "SUMMARY:$SENTENCE"
check "an event: no location" "$(prop admin admin $LIST "event-$RUN" LOCATION)" ""

curl -s -u admin:admin -X DELETE "$FILE" -o /dev/null
CODE=$(printf '%s\n' "$SENTENCE" | curl -s -u admin:admin -X PUT "$FILE" --data-binary @- -o /dev/null -w '%{http_code}')
check "a file upload: created" "$CODE" "201"
check "a file upload: content as sent" "$(curl -s -u admin:admin "$FILE")" "$SENTENCE"
curl -s -u admin:admin -X DELETE "$FILE" -o /dev/null

echo "== the setting"
check "on by default in the page's initial state" "$(initial_state)" "true"
occ user:setting admin tasks various_parseNewTasks 0 > /dev/null
check "off in the page's initial state" "$(initial_state)" "false"
vtodo "off-$RUN" "$SENTENCE" | put admin admin "$LIST" "off-$RUN" > /dev/null
check "switched off: title as sent" "$(prop admin admin $LIST "off-$RUN" SUMMARY)" "SUMMARY:$SENTENCE"
check "switched off: no due date" "$(prop admin admin $LIST "off-$RUN" DUE)" ""
occ user:setting admin tasks various_parseNewTasks --delete > /dev/null 2>&1

echo "== a user without Tasks"
OC_PASS=$P docker exec -e OC_PASS=$P -u www-data "$C" php occ user:add --password-from-env "$U" > /dev/null 2>&1 || true
occ user:setting "$U" core timezone "$ZONE" > /dev/null
occ group:add "$G" > /dev/null 2>&1 || true
mklist "$U" "$P" "$LIST"
vtodo "carol-on-$RUN" "$SENTENCE" | put "$U" "$P" "$LIST" "carol-on-$RUN" > /dev/null
check "with Tasks: parsed" "$(prop "$U" "$P" $LIST "carol-on-$RUN" DUE)" "DUE:$EVENING"
occ app:enable tasks --groups="$G" > /dev/null
sleep 4 # the web server caches app config for 3 seconds
vtodo "carol-off-$RUN" "$SENTENCE" | put "$U" "$P" "$LIST" "carol-off-$RUN" > /dev/null
check "Tasks not enabled for the user: title as sent" "$(prop "$U" "$P" $LIST "carol-off-$RUN" SUMMARY)" "SUMMARY:$SENTENCE"
check "Tasks not enabled for the user: no due date" "$(prop "$U" "$P" $LIST "carol-off-$RUN" DUE)" ""
occ app:enable tasks > /dev/null
sleep 4
check "Tasks enabled for everyone again" "$(occ config:app:get tasks enabled)" "yes"

echo "== the parse endpoint"
R=$(parse '{"text":"Dentist tomorrow at 10am","tz":"America/Phoenix"}')
check "found" "$(field "$R" found)" "true"
check "title" "$(field "$R" title)" '"Dentist"'
check "due tomorrow at 10" "$(field "$R" due)" "\"$(TZ=$ZONE date -v+1d +%Y-%m-%d)T10:00:00\""
R=$(parse '{"text":"Dentist tomorrow at 10am","tz":"America/Phoenix","ignore":["date"]}')
check "dates ignored: nothing found" "$(field "$R" found)" "false"
# A browser may name its zone by an older alias. Samoa (UTC-11) and Kiritimati
# (UTC+14) are 25 hours apart, so their dates always differ: the answer shows
# which zone was used
occ user:setting admin core timezone Pacific/Kiritimati > /dev/null
R=$(parse '{"text":"Dentist today","tz":"Pacific/Samoa"}')
check "an older zone name (Pacific/Samoa) is used, not the fallback" "$(field "$R" due)" "\"$(TZ=Pacific/Samoa date +%Y-%m-%d)T00:00:00\""
R=$(parse '{"text":"Dentist today","tz":"Asia/Calcutta"}')
check "an older zone name (Asia/Calcutta) is used" "$(field "$R" due)" "\"$(TZ=Asia/Kolkata date +%Y-%m-%d)T00:00:00\""
R=$(parse '{"text":"Dentist today","tz":"Not/AZone"}')
check "an unknown zone: the user's own" "$(field "$R" due)" "\"$(TZ=Pacific/Kiritimati date +%Y-%m-%d)T00:00:00\""
occ user:setting admin core timezone "$ZONE" > /dev/null
CODE=$(curl -s -u admin:admin -X POST "$HOST/index.php/apps/tasks/api/v1/parse" -H 'Content-Type: application/json' \
	--data '{"text":"Dentist tomorrow at 10am"}' -o /dev/null -w '%{http_code}')
check "without the CSRF check's header: refused" "$CODE" "412"

echo
[ "$FAILS" -eq 0 ] && echo "all checks passed" || echo "$FAILS check(s) failed"
exit "$FAILS"
